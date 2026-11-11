// src/server/crypto.js
import crypto from "node:crypto";

// AES-256-GCM. Stored as "v1:<iv>:<tag>:<ciphertext>" (all base64, so ":" is a safe separator).
function key() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set (run: node scripts/gen-secrets.mjs)");
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  return buf;
}

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decrypt(payload) {
  const [version, iv, tag, ct] = String(payload).split(":");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised ciphertext format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
