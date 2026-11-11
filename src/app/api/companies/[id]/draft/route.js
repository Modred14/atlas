// src/app/api/companies/[id]/draft/route.js
import { z } from "zod";
import { api, HttpError, json, readJson, routeId } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { draftOutreachFor } from "@/server/companies";
import { getSetting } from "@/server/settings";

export const maxDuration = 60;

const REASONS = {
  not_contactable: "This company is marked Do Not Contact.",
  research_too_thin: "Research on this company is too thin to personalise an email. Run research again or add details.",
  no_verified_contact: "There is no verified recruitment contact. Add a contact manually or allow unverified contacts.",
  already_contacted: "An outreach email to this contact already exists.",
};

// Drafts only. The result lands in the approval queue (or as an editable draft); nothing is sent here.
export const POST = api(async (request, ctx) => {
  await rateLimit("ai-generate", 60, 3600);
  const { allowUnverified, tone } = await readJson(request, z.object({ allowUnverified: z.boolean().default(false), tone: z.string().default("professional") }));
  const safety = await getSetting("safety");
  const result = await draftOutreachFor(await routeId(ctx), { tone, attachCv: safety.attachCvDefault, allowUnverified });
  if (!result.ok) throw new HttpError(422, REASONS[result.reason] || "Could not draft an email for this company.");
  return json({ outreach: result.outreach, lintOk: result.lintOk });
});
