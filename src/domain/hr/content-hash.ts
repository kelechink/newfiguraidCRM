import { createHash } from "node:crypto";

/** SHA-256 of the exact contract text a signature is bound to. Server only (node:crypto). */
export const contentHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
