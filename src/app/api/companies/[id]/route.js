// src/app/api/companies/[id]/route.js
import { z } from "zod";
import { api, HttpError, json, readJson, routeId } from "@/server/http";
import { getCompany, setCompanyStatus, STATUSES } from "@/server/companies";
import { addSuppression } from "@/server/outreach";
import { query } from "@/server/db";

const patch = z.object({
  status: z.enum(STATUSES).optional(),
  notes: z.string().max(4000).optional(),
  industry: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
});

export const GET = api(async (request, ctx) => {
  const company = await getCompany(await routeId(ctx));
  if (!company) throw new HttpError(404, "Company not found");
  return json({ company });
});

export const PATCH = api(async (request, ctx) => {
  const id = await routeId(ctx);
  const input = await readJson(request, patch);
  if (input.notes !== undefined) await query("update companies set notes = $2, updated_at = now() where id = $1", [id, input.notes]);
  if (input.industry !== undefined) await query("update companies set industry = $2, updated_at = now() where id = $1", [id, input.industry || null]);
  if (input.location !== undefined) await query("update companies set location = $2, updated_at = now() where id = $1", [id, input.location || null]);
  if (input.status) {
    await setCompanyStatus(id, input.status);
    if (input.status === "do_not_contact") {
      const c = await getCompany(id);
      for (const k of c.contacts) await addSuppression("email", k.email, "Company marked Do Not Contact");
    }
  }
  return json({ company: await getCompany(id) });
});

export const DELETE = api(async (request, ctx) => {
  await query("delete from companies where id = $1", [await routeId(ctx)]);
  return json({ ok: true });
});
