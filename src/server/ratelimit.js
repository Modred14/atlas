// src/server/ratelimit.js
import { one, query } from "./db.js";

export class RateLimitError extends Error {
  constructor(message = "Too many requests. Try again shortly.") {
    super(message);
    this.status = 429;
  }
}

// Fixed-window counter in Postgres: works across serverless instances without extra infrastructure.
export async function rateLimit(key, limit, windowSec) {
  const windowStart = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  const row = await one(
    `insert into rate_limits (key, window_start, count) values ($1, to_timestamp($2), 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [key, windowStart],
  );
  if (Math.random() < 0.02) {
    await query("delete from rate_limits where window_start < now() - interval '2 days'").catch(() => {});
  }
  if (row.count > limit) throw new RateLimitError();
  return row.count;
}
