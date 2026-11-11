// src/app/api/inbox/sync/route.js
import { api, json } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { syncInbox } from "@/server/inbox";

export const maxDuration = 60;

export const POST = api(async () => {
  await rateLimit("inbox-sync", 30, 3600);
  return json({ ok: true, ...(await syncInbox({ budgetMs: 45_000 })) });
});
