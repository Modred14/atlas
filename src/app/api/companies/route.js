// src/app/api/companies/route.js
import { z } from "zod";
import { api, HttpError, json, readJson } from "@/server/http";
import { listCompanies, upsertCompany } from "@/server/companies";

export const GET = api(async (request) => {
  const p = request.nextUrl.searchParams;
  const companies = await listCompanies({
    search: p.get("q") || undefined,
    status: p.get("status") || undefined,
    verified: p.get("verified") || undefined,
    sort: p.get("sort") || undefined,
    dir: p.get("dir") || undefined,
  });
  return json({ companies });
});

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  website: z.string().trim().max(300).optional().default(""),
  industry: z.string().trim().max(80).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(600).optional().default(""),
});

export const POST = api(async (request) => {
  const input = await readJson(request, schema);
  const { company, created } = await upsertCompany({ ...input, source: "manual" });
  if (!company) throw new HttpError(400, "Enter a company name");
  return json({ company, created });
});
