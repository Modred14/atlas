// src/app/api/outreach/route.js
import { api, json } from "@/server/http";
import { listOutreach } from "@/server/outreach";
import { one } from "@/server/db";

const csv = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export const GET = api(async (request) => {
  const p = request.nextUrl.searchParams;
  const list = await listOutreach({
    statuses: csv(p.get("status")),
    kinds: csv(p.get("kind")),
    campaignId: p.get("campaign") ? Number(p.get("campaign")) : undefined,
    search: p.get("q") || undefined,
    limit: Number(p.get("limit")) || 100,
    offset: Number(p.get("offset")) || 0,
  });
  const counts = await one(
    `select count(*) filter (where status = 'pending_approval') as pending,
            count(*) filter (where status = 'approved') as approved
     from outreach`,
  );
  return json({ emails: list, counts });
});
