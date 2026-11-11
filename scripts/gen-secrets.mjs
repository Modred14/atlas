// scripts/gen-secrets.mjs
// Generates the random secrets Atlas needs. Run once, paste into .env.local / your host's env settings.
import crypto from "node:crypto";

console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}`);
console.log(`ENCRYPTION_KEY=${crypto.randomBytes(32).toString("base64")}`);
console.log(`CRON_SECRET=${crypto.randomBytes(24).toString("hex")}`);
console.log("\nKeep ENCRYPTION_KEY safe: losing it makes stored Gmail tokens and API keys unreadable (you would just reconnect).");
