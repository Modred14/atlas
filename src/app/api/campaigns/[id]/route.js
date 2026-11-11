// src/app/api/campaigns/[id]/route.js
import { z } from "zod";
import { api, json, readJson, routeId } from "@/server/http";
import { updateCampaign } from "@/server/campaigns";
import { getAccount } from "@/server/gmail";
import { query } from "@/server/db";
import { campaignConfigSchema as configSchema } from "@/server/schemas";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["draft", "active", "paused", "completed"]).optional(),
  config: configSchema.partial().optional(),
  startsOn: date,
  endsOn: date,
});

export const PATCH = api(async (request, ctx) => {
  const input = await readJson(request, patch);
  if (input.status === "active") {
    const account = await getAccount();
    if (!account || account.status !== "connected") {
      return json({ error: "Connect Gmail in Settings before activating a campaign." }, { status: 409 });
    }
  }
  return json({ campaign: await updateCampaign(await routeId(ctx), input) });
});

export const DELETE = api(async (request, ctx) => {
  // Emails already sent stay in Sent Emails; anything still waiting is cancelled.
  const id = await routeId(ctx);
  await query("update outreach set status='rejected', error='Campaign deleted', updated_at=now() where campaign_id=$1 and status in ('draft','pending_approval','approved')", [id]);
  await query("delete from campaigns where id = $1", [id]);
  return json({ ok: true });
});
