// src/app/api/outreach/[id]/send/route.js
import { z } from "zod";
import { api, json, readJson, routeId } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { sendOutreach } from "@/server/outreach";

export const maxDuration = 60;

// The only manual send endpoint. It refuses unless `confirmedHash` matches the stored content, which the
// browser can only know after the owner saw the confirmation dialog for that exact content.
export const POST = api(async (request, ctx) => {
  await rateLimit("manual-send", 30, 3600);
  const { confirmedHash } = await readJson(request, z.object({ confirmedHash: z.string().length(64) }));
  const result = await sendOutreach(await routeId(ctx), { confirmedHash, manual: true });
  if (!result.ok) return json({ error: result.error, quota: result.quota, reauth: result.reauth }, { status: result.reauth ? 401 : result.quota ? 429 : 502 });
  return json({ ok: true, id: result.id });
});
