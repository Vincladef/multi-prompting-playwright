import test from "node:test";
import assert from "node:assert/strict";
import { deriveRecipientPublicKey, sealRequest, unsealRequest } from "../src/kernel-sealed.mjs";

test("End-to-end private request encryption and decryption", () => {
  const secret = "kernel-demo-secret-not-a-production-credential-0123456789";
  const publicKey = deriveRecipientPublicKey(secret).publicRaw;
  const body = {mode:"live",target:"new",prompts:["Premier prompt français","Deuxième prompt"]};
  const envelope = sealRequest(body, publicKey);
  assert.equal(envelope.format,"mp-kernel-x25519-aes256gcm-v1");
  assert.ok(!JSON.stringify(envelope).includes("Premier prompt"));
  assert.deepEqual(unsealRequest(envelope, secret), body);
  assert.notEqual(sealRequest(body, publicKey).ciphertext, envelope.ciphertext);
});
test("Tamper protection and key isolation", () => {
  const secret = "kernel-demo-secret-not-a-production-credential-0123456789";
  const publicKey = deriveRecipientPublicKey(secret).publicRaw;
  const envelope = sealRequest({prompts:["ALPHA"]},publicKey);
  assert.throws(()=>unsealRequest(envelope,"another-secret-not-production-123456789012345"));
  assert.throws(()=>unsealRequest({...envelope,ciphertext:envelope.ciphertext.slice(0,-4)+"AAAA"},secret));
  assert.throws(()=>unsealRequest({...envelope,nonce:"a"},secret));
});
