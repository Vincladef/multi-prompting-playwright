import { randomBytes, hkdfSync, createPrivateKey, createPublicKey, diffieHellman,
  createCipheriv, createDecipheriv, generateKeyPairSync } from "node:crypto";

const PKCS8_X25519 = Buffer.from("302e020100300506032b656e04220420", "hex");
const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex");
const KEY_INFO = Buffer.from("multi-prompting-kernel-derive-x25519-v1");
const CIPHER_INFO = Buffer.from("multi-prompting-kernel-envelope-v1");
const AAD = Buffer.from("multi-prompting-kernel-requests-v1");
const FORMAT = "mp-kernel-x25519-aes256gcm-v1";
const MAX_PLAINTEXT = 240000;

function requireKey(key) {
  if (typeof key !== "string" || key.length < 32)
    throw new Error("invalid_secret_length");
}

function fromBase64(value, size) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9+/]+={0,2}$/.test(value) || value.length > 400000)
    throw new Error("invalid_envelope");
  const data = Buffer.from(value, "base64");
  if (size && data.length !== size) throw new Error("invalid_envelope");
  return data;
}

export function deriveRecipientPublicKey(kernelKey) {
  requireKey(kernelKey);
  const seed = Buffer.from(hkdfSync("sha256", Buffer.from(kernelKey), Buffer.alloc(0), KEY_INFO, 32));
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_X25519, seed]), format: "der", type: "pkcs8"
  });
  const publicKey = createPublicKey(privateKey).export({format:"der",type:"spki"});
  return {
    privateKey,
    publicRaw: Buffer.from(publicKey).subarray(-32).toString("base64")
  };
}

export function sealRequest(data, recipientRawBase64) {
  const raw = Buffer.from(JSON.stringify(data), "utf8");
  if (!raw.length || raw.length > MAX_PLAINTEXT) throw new Error("request_too_large");
  const peer = createPublicKey({
    key: Buffer.concat([SPKI_X25519, fromBase64(recipientRawBase64,32)]),
    format:"der",type:"spki"
  });
  const ephemeral = generateKeyPairSync("x25519");
  const publicEphemeral = ephemeral.publicKey.export({format:"der",type:"spki"}).subarray(-32);
  const shared = diffieHellman({privateKey:ephemeral.privateKey,publicKey:peer});
  const symmetricKey = Buffer.from(hkdfSync("sha256", shared, Buffer.alloc(0), CIPHER_INFO, 32));
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", symmetricKey, nonce);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(raw),cipher.final()]);
  return {
    format: FORMAT,
    ephemeral_public: publicEphemeral.toString("base64"),
    nonce: nonce.toString("base64"),
    ciphertext: Buffer.concat([encrypted,cipher.getAuthTag()]).toString("base64")
  };
}

export function unsealRequest(envelope, kernelKey) {
  if (!envelope || envelope.format !== FORMAT) throw new Error("invalid_envelope");
  const peer = createPublicKey({
    key: Buffer.concat([SPKI_X25519, fromBase64(envelope.ephemeral_public,32)]),
    format:"der",type:"spki"
  });
  const nonce = fromBase64(envelope.nonce,12);
  const combined = fromBase64(envelope.ciphertext);
  if (combined.length < 17 || combined.length > MAX_PLAINTEXT + 64)
    throw new Error("invalid_envelope");
  const {privateKey} = deriveRecipientPublicKey(kernelKey);
  const shared = diffieHellman({privateKey,publicKey:peer});
  const symmetricKey = Buffer.from(hkdfSync("sha256", shared, Buffer.alloc(0), CIPHER_INFO, 32));
  const decipher = createDecipheriv("aes-256-gcm", symmetricKey, nonce);
  decipher.setAAD(AAD);
  decipher.setAuthTag(combined.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(combined.subarray(0,-16)),decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
