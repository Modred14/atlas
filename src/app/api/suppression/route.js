// src/app/api/suppression/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { addSuppression } from "@/server/outreach";
import { query, rows } from "@/server/db";

const body = z.object({ kind: z.enum(["email", "domain"]), value: z.string().trim().min(3).max(254), reason: z.string().trim().max(200).optional() });

export const GET = api(async () => json({ items: await rows("select * from suppression order by id desc limit 500") }));

export const POST = api(async (request) => {
  const b = await readJson(request, body);
  await addSuppression(b.kind, b.value, b.reason || "Added manually");
  return json({ ok: true });
});

export const DELETE = api(async (request) => {
  const { id } = await readJson(request, z.object({ id: z.number().int().positive() }));
  await query("delete from suppression where id = $1", [id]);
  return json({ ok: true });
});
