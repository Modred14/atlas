// src/app/api/outreach/approve/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { approveOutreach } from "@/server/outreach";

export const POST = api(async (request) => {
  const { ids } = await readJson(request, z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) }));
  return json(await approveOutreach(ids));
});
