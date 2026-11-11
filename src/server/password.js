// src/server/password.js
import crypto from "node:crypto";

// Format: scrypt:N:r:p:<salt b64url>:<hash b64url>  (no "$", so Next's env expansion leaves it alone)
export function hashPassword(password) {
  const N = 16384, r = 8, p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, salt, hash] = String(stored).split(":");
    if (alg !== "scrypt") return false;
    const expected = Buffer.from(hash, "base64url");
    const got = crypto.scryptSync(password, Buffer.from(salt, "base64url"), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}
