// src/app/api/export/route.js
import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { rows } from "@/server/db";

// Full data export (JSON). Secrets, OAuth tokens and file contents are deliberately excluded.
export const GET = api(async () => {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: await rows("select key, value from app_settings where key not in ('send_pause')"),
    profile: await rows("select data from profile"),
    companies: await rows("select * from companies order by id"),
    contacts: await rows("select * from contacts order by id"),
    campaigns: await rows("select * from campaigns order by id"),
    outreach: await rows("select * from outreach order by id"),
    inbox: await rows("select * from inbox_messages order by id"),
    suppression: await rows("select * from suppression order by id"),
    documents: await rows("select id, kind, filename, mime, size, sha256, source, is_default, created_at from documents"),
  };
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="atlas-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});
