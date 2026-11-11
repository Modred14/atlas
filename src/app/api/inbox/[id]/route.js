// src/app/api/inbox/[id]/route.js
import { z } from "zod";
import { api, HttpError, json, readJson, routeId } from "@/server/http";
import { getInboxMessage } from "@/server/inbox";
import { query } from "@/server/db";

export const GET = api(async (request, ctx) => {
  const m = await getInboxMessage(await routeId(ctx));
  if (!m) throw new HttpError(404, "Message not found");
  return json({ message: m });
});

export const PATCH = api(async (request, ctx) => {
  const id = await routeId(ctx);
  const { handled } = await readJson(request, z.object({ handled: z.boolean() }));
  await query("update inbox_messages set handled = $2 where id = $1", [id, handled]);
  return json({ ok: true });
});
