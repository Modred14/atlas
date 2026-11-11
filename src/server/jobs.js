// src/server/jobs.js
import { one, query } from "./db.js";
import { logEvent } from "./log.js";

export async function enqueue(type, payload = {}, { dedupeKey = null, runAt = null, maxAttempts = 3 } = {}) {
  return one(
    `insert into jobs (type, payload, dedupe_key, run_at, max_attempts)
     values ($1, $2::jsonb, $3, coalesce($4::timestamptz, now()), $5)
     on conflict do nothing returning id`,
    [type, JSON.stringify(payload), dedupeKey, runAt, maxAttempts],
  );
}

export function claimJob() {
  return one(
    `update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
     where id = (select id from jobs where status = 'queued' and run_at <= now() order by run_at, id limit 1 for update skip locked)
     returning *`,
  );
}

export async function finishJob(id) {
  await query("update jobs set status = 'done', finished_at = now(), last_error = null where id = $1", [id]);
}

// Exponential backoff (2, 4, 8 minutes). Config problems (missing key, not connected) will not fix
// themselves on retry, so they fail immediately and show up in the activity log.
export async function failJob(job, err) {
  const hopeless = err?.status === 400 || err?.config || job.attempts >= job.max_attempts;
  await query(
    `update jobs set status = $2, last_error = $3, finished_at = case when $2 = 'failed' then now() else null end,
       run_at = now() + (power(2, $4::int) * interval '1 minute'), locked_at = null where id = $1`,
    [job.id, hopeless ? "failed" : "queued", String(err?.message || err).slice(0, 500), job.attempts],
  );
  await logEvent(hopeless ? "error" : "warn", "job_failed", { type: job.type, id: job.id, attempts: job.attempts, message: err?.message });
}

export async function recoverStaleJobs() {
  await query(
    `update jobs set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
       run_at = now(), locked_at = null, last_error = coalesce(last_error, 'Interrupted (timed out)')
     where status = 'running' and locked_at < now() - interval '10 minutes'`,
  );
}

export async function processJobs({ budgetMs, handlers }) {
  const started = Date.now();
  const results = [];
  while (Date.now() - started < budgetMs) {
    const job = await claimJob();
    if (!job) break;
    try {
      const handler = handlers[job.type];
      if (!handler) throw Object.assign(new Error(`No handler for job type "${job.type}"`), { status: 400 });
      const result = await handler(job.payload);
      await finishJob(job.id);
      results.push({ type: job.type, ok: true, result });
    } catch (err) {
      await failJob(job, err);
      results.push({ type: job.type, ok: false, error: err.message });
    }
  }
  return results;
}
