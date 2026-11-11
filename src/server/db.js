// src/server/db.js
import pg from "pg";

// bigint -> number (ids and counts stay well below 2^53), DATE -> "YYYY-MM-DD" string.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
pg.types.setTypeParser(1082, (v) => v);

let pool;

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
    pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  }
  return pool;
}

// Tests inject an in-process PGlite database here; production never sets it.
function testDb() {
  return globalThis.__ATLAS_TEST_DB__ || null;
}

export async function query(text, params = []) {
  const t = testDb();
  if (t) return t.query(text, params);
  return getPool().query(text, params);
}

export async function rows(text, params = []) {
  return (await query(text, params)).rows;
}

export async function one(text, params = []) {
  return (await query(text, params)).rows[0] || null;
}

export async function tx(fn) {
  const t = testDb();
  if (t) {
    await t.query("begin");
    try {
      const out = await fn({ query: (a, b) => t.query(a, b) });
      await t.query("commit");
      return out;
    } catch (err) {
      await t.query("rollback");
      throw err;
    }
  }
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}
