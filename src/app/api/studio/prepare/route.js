// src/app/api/studio/prepare/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { contentHash, createOutreach, isSuppressed } from "@/server/outreach";
import { isValidEmail, normalizeEmail } from "@/server/util";
import { getAccount } from "@/server/gmail";
import { getDefaultCv } from "@/server/documents";
import { getInboxMessage } from "@/server/inbox";

// Step 1 of sending: freeze exactly what was reviewed into a draft row and return the server's copy
// plus its hash. The confirmation dialog shows THIS copy, and /api/outreach/:id/send only accepts that hash.
const schema = z.object({
  toEmail: z.string().trim().max(254).refine(isValidEmail, "Enter a valid recipient email"),
  toName: z.string().trim().max(120).optional().default(""),
  subject: z.string().trim().min(1, "Add a subject").max(200),
  body: z.string().trim().min(1, "The email body is empty").max(20000),
  attachCv: z.boolean().default(false),
  attachmentIds: z.array(z.number().int().positive()).max(5).default([]),
  kind: z.enum(["studio", "reply"]).default("studio"),
  parentId: z.number().int().positive().optional(),
  inboxId: z.number().int().positive().optional(),
});

export const POST = api(async (request) => {
  const input = await readJson(request, schema);
  const warnings = [];
  const sup = await isSuppressed(input.toEmail);
  if (sup) warnings.push(`${normalizeEmail(input.toEmail)} is on your suppression list (${sup.reason || sup.kind}). Sending will be blocked.`);
  const account = await getAccount();
  if (!account || account.status !== "connected") warnings.push("Gmail is not connected. Connect it in Settings → Gmail before sending.");
  if (input.attachCv && !(await getDefaultCv())) warnings.push("CV attachment is on but no CV is stored yet. It will be fetched from your CV source when sending, or the send will fail.");

  let thread = {};
  if (input.kind === "reply" && input.inboxId) {
    const m = await getInboxMessage(input.inboxId);
    if (m) thread = { threadId: m.thread_id, replyToMessageId: m.rfc_message_id, parentId: m.outreach_id, companyId: m.company_id };
  }

  const row = await createOutreach({
    kind: input.kind, toEmail: input.toEmail, toName: input.toName, subject: input.subject, body: input.body,
    attachCv: input.attachCv, attachmentIds: input.attachmentIds, status: "draft", ...thread,
  });
  return json({
    id: row.id,
    hash: contentHash(row),
    email: {
      to: row.to_email, toName: row.to_name, subject: row.subject, body: row.body,
      attachCv: row.attach_cv, attachmentIds: row.attachment_ids,
    },
    warnings,
  });
});
