// tests/helpers.mjs
// Test harness: in-process Postgres (PGlite) running the real migration, plus a scriptable fetch.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.APP_URL = "https://atlas.test";
process.env.GMAIL_ALLOWED_ACCOUNT = "favourdomirin@gmail.com";

export async function freshDb() {
  const db = new PGlite();
  const sql = fs.readFileSync(path.join(process.cwd(), "db/migrations/001_init.sql"), "utf8");
  await db.exec(sql);
  globalThis.__ATLAS_TEST_DB__ = db;
  return db;
}

// Routes fetch() calls by URL substring. Unmatched calls fail loudly so tests never hit the network.
export function mockFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    calls.push({ url, method: init.method || "GET", body: init.body, headers: init.headers });
    for (const [needle, handler] of routes) {
      if (url.includes(needle)) {
        const out = typeof handler === "function" ? await handler(url, init, calls) : handler;
        if (out instanceof Response) return out;
        return new Response(JSON.stringify(out.body ?? out), { status: out.status || 200, headers: { "content-type": "application/json" } });
      }
    }
    throw new Error(`Unmocked fetch: ${url}`);
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

export async function connectGmail(overrides = {}) {
  const { encrypt } = await import("../src/server/crypto.js");
  const { query } = await import("../src/server/db.js");
  await query(
    `insert into gmail_account (id, email, refresh_token_enc, access_token_enc, access_expires_at, scopes, status)
     values (1, 'favourdomirin@gmail.com', $1, $2, now() + interval '1 hour', 'gmail.send gmail.readonly', $3)
     on conflict (id) do update set status = excluded.status, access_expires_at = excluded.access_expires_at`,
    [encrypt("refresh-token"), encrypt("access-token"), overrides.status || "connected"],
  );
}

export const gmailSendOk = (counter = { n: 0 }) => (url, init) => {
  counter.n++;
  const raw = JSON.parse(init.body).raw;
  counter.lastRaw = Buffer.from(raw, "base64url").toString("utf8");
  return { id: `msg${counter.n}`, threadId: `thr${counter.n}` };
};

export const metadataOk = () => ({ id: "x", payload: { headers: [{ name: "Message-ID", value: "<abc@mail.gmail.com>" }] } });
