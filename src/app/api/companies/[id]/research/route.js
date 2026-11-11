// src/app/api/companies/[id]/research/route.js
import { api, json, routeId } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { researchCompany } from "@/server/companies";

export const maxDuration = 60;

export const POST = api(async (request, ctx) => {
  await rateLimit("research", 40, 3600);
  return json(await researchCompany(await routeId(ctx)));
});
