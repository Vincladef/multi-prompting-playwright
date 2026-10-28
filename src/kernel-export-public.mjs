import { deriveRecipientPublicKey } from "./kernel-sealed.mjs";
if (!process.env.KERNEL_API_KEY) throw new Error("missing_kernel_secret");
const result = deriveRecipientPublicKey(process.env.KERNEL_API_KEY);
console.log("KERNEL_RECIPIENT_PUBLIC_KEY=" + result.publicRaw);
