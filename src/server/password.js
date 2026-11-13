// src/server/password.js
import crypto from "node:crypto";

// Format: scrypt:N:r:p:<salt b64url>:<hash b64url>  (no "$", so Next's env expansion leaves it alone)
export function hashPassword(password) {
  const N = 16384, r = 8, p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

// Hosting dashboards and hand-edited .env files often leave stray quotes, whitespace, or the
// "ADMIN_PASSWORD_HASH=" prefix on the value. Strip those so a correct password isn't rejected.
export function normalizeStoredHash(stored) {
  let v = String(stored ?? "").trim();
  v = v.replace(/^ADMIN_PASSWORD_HASH\s*=\s*/, "").trim();
  v = v.replace(/^(["'`])(.*)\1$/s, "$2").trim();
  return v;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, salt, hash] = normalizeStoredHash(stored).split(":");
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