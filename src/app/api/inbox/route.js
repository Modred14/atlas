// src/app/api/inbox/route.js
import { api, json } from "@/server/http";
import { inboxLastSync, listInbox } from "@/server/inbox";
import { getAccount } from "@/server/gmail";

export const GET = api(async (request) => {
  const p = request.nextUrl.searchParams;
  const messages = await listInbox({ category: p.get("category") || undefined, unhandledOnly: p.get("unhandled") === "1" });
  const account = await getAccount();
  return json({ messages, lastSync: await inboxLastSync(), gmail: account ? account.status : "disconnected" });
});
