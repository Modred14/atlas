// src/server/errors.js
// Turns the usual deployment problems (database not configured, migrations not run, bad keys) into a
// message that says what to fix. Fixed strings only: nothing from the error itself is echoed back.
export function explainServerError(err) {
  const msg = String(err?.message || "");
  const code = err?.code;
  if (/DATABASE_URL is not set/i.test(msg)) return "DATABASE_URL is not set on the server. Add it to your host's environment variables and redeploy.";
  if (code === "42P01") return "The database tables do not exist yet. Run `npm run migrate` against the production database.";
  if (code === "42703") return "The database schema is out of date. Run `npm run migrate` against the production database.";
  if (code === "28P01" || code === "28000") return "The database rejected the username or password in DATABASE_URL.";
  if (code === "3D000") return "The database named in DATABASE_URL does not exist.";
  if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes(code) || /timeout exceeded when trying to connect|Connection terminated|server does not support SSL|SSL (SYSCALL|connection)|self.signed certificate/i.test(msg)) {
    return "Could not connect to the database. Check DATABASE_URL (Neon and Supabase need ?sslmode=require) and that the database is running.";
  }
  if (/ENCRYPTION_KEY/.test(msg)) return "ENCRYPTION_KEY is missing or invalid on the server. Run `npm run gen-secrets` and set it in the host's environment variables.";
  if (/SESSION_SECRET/.test(msg)) return "SESSION_SECRET is missing or shorter than 32 characters on the server.";
  return null;
}