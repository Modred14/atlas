// src/app/api/nav-counts/route.js
import { api, json } from "@/server/http";
import { one } from "@/server/db";
import { getSetting } from "@/server/settings";

export const GET = api(async () => {
  const row = await one(
    `select
       (select count(*) from outreach where status = 'pending_approval') as pending,
       (select count(*) from inbox_messages where handled = false and category not in ('bounce','auto_reply','opt_out')) as unread`,
  );
  const app = await getSetting("app");
  return json({ ...row, show: app.inboxBadge });
});
