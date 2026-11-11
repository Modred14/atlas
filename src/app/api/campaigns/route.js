// src/app/api/campaigns/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { CAMPAIGN_DEFAULTS, campaignConfig, createCampaign, listCampaigns } from "@/server/campaigns";
import { campaignConfigSchema as configSchema } from "@/server/schemas";
import { getSetting } from "@/server/settings";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

export const GET = api(async () => {
  const campaigns = (await listCampaigns()).map((c) => ({ ...c, config: campaignConfig(c) }));
  return json({ campaigns, safety: await getSetting("safety"), defaults: CAMPAIGN_DEFAULTS });
});

export const POST = api(async (request) => {
  const body = await readJson(request, z.object({
    name: z.string().trim().min(1).max(80),
    config: configSchema.partial(),
    startsOn: date,
    endsOn: date,
  }));
  const safety = await getSetting("safety");
  // New campaigns always start in Approval Mode, whatever the request says.
  const config = { ...body.config, requireApproval: true, dailyTarget: Math.min(body.config.dailyTarget ?? 20, safety.dailyHardCap) };
  const campaign = await createCampaign({ name: body.name, config, startsOn: body.startsOn ?? null, endsOn: body.endsOn ?? null });
  return json({ campaign });
});
