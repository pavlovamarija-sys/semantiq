import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY is not configured.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return decoded;
}
export function encryptToken(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
export function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
