// src/app/api/studio/generate/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { getProfile } from "@/server/profile";
import { TONES, writeStudioEmail } from "@/server/ai/writer";
import { isValidEmail, normalizeEmail } from "@/server/util";

export const maxDuration = 60;

const schema = z.object({
  toEmail: z.string().trim().max(254).refine(isValidEmail, "Enter a valid recipient email"),
  toName: z.string().trim().max(120).optional().default(""),
  purpose: z.string().trim().min(10, "Describe what the email should say (at least a sentence)").max(4000),
  tone: z.enum(TONES).default("professional"),
  extra: z.string().trim().max(2000).optional().default(""),
});

// Generating never sends anything. It only returns text for the owner to review.
export const POST = api(async (request) => {
  await rateLimit("ai-generate", 60, 3600);
  const input = await readJson(request, schema);
  const out = await writeStudioEmail({
    profile: await getProfile(),
    toEmail: normalizeEmail(input.toEmail),
    toName: input.toName || null,
    purpose: input.purpose,
    tone: input.tone,
    extra: input.extra,
  });
  return json({ subject: out.subject, body: out.body, lint: out.lint, generation: out.generation });
});
