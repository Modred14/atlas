// src/server/log.js
import { query, rows } from "./db.js";

// Structured activity log. Never throws: logging must not break the operation it describes.
export async function logEvent(level, event, data = null) {
  try {
    await query("insert into activity_log (level, event, data) values ($1, $2, $3::jsonb)", [
      level,
      event,
      data ? JSON.stringify(data) : null,
    ]);
  } catch (err) {
    console.error("[log] failed to write activity:", err.message);
  }
  if (level === "error") console.error(`[${event}]`, data);
}

export function recentActivity(limit = 40) {
  return rows("select id, level, event, data, created_at from activity_log order by id desc limit $1", [limit]);
}
