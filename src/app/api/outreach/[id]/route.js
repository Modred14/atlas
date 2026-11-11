// src/app/api/outreach/[id]/route.js
import { z } from "zod";
import { api, HttpError, json, readJson, routeId } from "@/server/http";
import { editOutreach, getOutreach } from "@/server/outreach";
import { isValidEmail } from "@/server/util";

const patch = z.object({
  toEmail: z.string().trim().max(254).refine(isValidEmail, "Enter a valid recipient email").optional(),
  toName: z.string().trim().max(120).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
  attachCv: z.boolean().optional(),
});

export const GET = api(async (request, ctx) => {
  const row = await getOutreach(await routeId(ctx));
  if (!row) throw new HttpError(404, "Email not found");
  return json({ email: row });
});

// Editing an approved email sends it back to pending approval: the owner approves exactly what goes out.
export const PATCH = api(async (request, ctx) => {
  const row = await editOutreach(await routeId(ctx), await readJson(request, patch));
  return json({ email: row });
});
