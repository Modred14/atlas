// src/app/api/documents/sync/route.js
import { api, json } from "@/server/http";
import { syncCv } from "@/server/documents";
import { rateLimit } from "@/server/ratelimit";

export const maxDuration = 60;

// "Fetch from modred.dev now": forces a refresh from the configured CV source and reports what happened.
export const POST = api(async () => {
  await rateLimit("cv-sync", 12, 3600);
  const { cv, changed } = await syncCv({ force: true });
  return json({
    ok: true,
    changed,
    document: { id: cv.id, filename: cv.filename, size: cv.size, created_at: cv.created_at, source_url: cv.source_url },
  });
});
