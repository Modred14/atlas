// src/app/api/inbox/[id]/suggest-reply/route.js
import { z } from "zod";
import { api, HttpError, json, readJson, routeId } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { getInboxMessage } from "@/server/inbox";
import { getProfile } from "@/server/profile";
import { suggestReply } from "@/server/ai/writer";

export const maxDuration = 60;

// Suggests a reply only. Sending goes through /api/studio/prepare then the confirmation dialog.
export const POST = api(async (request, ctx) => {
  await rateLimit("ai-generate", 60, 3600);
  const m = await getInboxMessage(await routeId(ctx));
  if (!m) throw new HttpError(404, "Message not found");
  const { note } = await readJson(request, z.object({ note: z.string().trim().max(1000).optional() }));
  const out = await suggestReply({
    profile: await getProfile(),
    incoming: m,
    previousSent: m.sent_subject ? { subject: m.sent_subject, body: m.sent_body } : null,
    note,
  });
  const subject = /^re:/i.test(m.subject || "") ? m.subject : `Re: ${m.subject || ""}`.trim();
  return json({ subject, body: out.body, lint: out.lint, generation: out.generation, to: m.from_email, toName: m.from_name });
});
