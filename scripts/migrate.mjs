// scripts/migrate.mjs
// Applies db/migrations/*.sql in order. Safe to re-run.
// Usage: npm run migrate   (reads DATABASE_URL from .env.local or the environment)
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required. Put it in .env.local or export it.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(
  "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
);

const dir = path.join(process.cwd(), "db", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  const done = await client.query("select 1 from schema_migrations where name = $1", [file]);
  if (done.rowCount) continue;
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log("applied", file);
  } catch (err) {
    await client.query("rollback");
    console.error("failed", file, "-", err.message);
    process.exit(1);
  }
}

console.log("migrations up to date");
await client.end();
