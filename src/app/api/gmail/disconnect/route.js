// src/app/api/gmail/disconnect/route.js
import { api, json } from "@/server/http";
import { disconnect } from "@/server/gmail";
import { logEvent } from "@/server/log";

export const POST = api(async () => {
  await disconnect();
  await logEvent("info", "gmail_disconnected");
  return json({ ok: true });
});
