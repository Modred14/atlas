// src/app/api/agent/discover/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { discoverForCampaign } from "@/server/campaigns";
import { enqueue } from "@/server/jobs";
import { getSetting } from "@/server/settings";
import { searchCapability } from "@/server/discovery";
import { one, rows } from "@/server/db";

export const maxDuration = 60;

// Manual "find companies now" using the saved career preferences. Research is queued per company.
export const POST = api(async (request) => {
  await rateLimit("discover", 10, 3600);
  const { want } = await readJson(request, z.object({ want: z.number().int().min(5).max(60).default(20) }));
  const career = await getSetting("career");
  const found = await discoverForCampaign({ id: 0, config: { categories: career.titles, countries: [], industries: [] } }, { want });
  const pending = await rows("select id from companies where status = 'discovered' and researched_at is null order by id limit $1", [want]);
  let queued = 0;
  for (const c of pending) if (await enqueue("research_company", { companyId: c.id }, { dedupeKey: `research:${c.id}` })) queued++;
  return json({ ...found, queuedResearch: queued });
});

export const GET = api(async () => {
  const counts = await one(
    `select count(*) filter (where status = 'discovered') as discovered,
            count(*) filter (where status = 'researched') as researched,
            count(*) filter (where status = 'ready_for_outreach') as ready
     from companies`,
  );
  const jobs = await one("select count(*) filter (where status = 'queued') as queued, count(*) filter (where status = 'running') as running, count(*) filter (where status = 'failed') as failed from jobs");
  return json({ counts, jobs, searchCapability: await searchCapability() });
});
