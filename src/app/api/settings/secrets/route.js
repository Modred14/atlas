// src/app/api/settings/secrets/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { deleteSecret, setSecret } from "@/server/settings";
import { PROVIDERS } from "@/server/ai";

const body = z.object({
  name: z.string().refine((n) => n === "brave" || n in PROVIDERS, "Unknown key name"),
  value: z.string().trim().min(8).max(500).optional(),
});

const secretName = (n) => (n === "brave" ? "search_key:brave" : `ai_key:${n}`);

// Keys are encrypted before they reach the database and are never returned to the browser.
export const PUT = api(async (request) => {
  const { name, value } = await readJson(request, body);
  if (!value) return json({ error: "Enter a key" }, { status: 400 });
  await setSecret(secretName(name), value);
  return json({ ok: true });
});

export const DELETE = api(async (request) => {
  const { name } = await readJson(request, body.pick({ name: true }));
  await deleteSecret(secretName(name));
  return json({ ok: true });
});
