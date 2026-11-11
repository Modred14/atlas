// src/app/api/studio/refine/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { getProfile } from "@/server/profile";
import { refineEmail } from "@/server/ai/writer";

export const maxDuration = 60;

const schema = z.object({
  subject: z.string().trim().max(200),
  body: z.string().trim().min(1).max(8000),
  action: z.enum(["shorter", "professional", "friendlier", "improve"]),
});

export const POST = api(async (request) => {
  await rateLimit("ai-generate", 60, 3600);
  const input = await readJson(request, schema);
  return json(await refineEmail({ profile: await getProfile(), ...input }));
});
