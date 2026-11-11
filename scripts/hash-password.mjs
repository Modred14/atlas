// scripts/hash-password.mjs
// Prints an ADMIN_PASSWORD_HASH value for .env.local.
// Usage: node scripts/hash-password.mjs "your password"
//        echo "your password" | node scripts/hash-password.mjs
import crypto from "node:crypto";

async function readPassword() {
  if (process.argv[2]) return process.argv[2];
  if (process.stdin.isTTY) {
    console.error('Usage: node scripts/hash-password.mjs "your password"');
    process.exit(1);
  }
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

const password = await readPassword();
if (password.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}

const N = 16384, r = 8, p = 1;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
console.log(`ADMIN_PASSWORD_HASH=scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`);
