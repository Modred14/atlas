// src/app/api/cron/tick/route.js
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runTick } from "@/server/campaigns";
import { logEvent } from "@/server/log";

export const maxDuration = 60;

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Called by a scheduler every few minutes (see README). Authenticated with a bearer secret, not the login cookie.
async function handle(request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runTick({ budgetMs: 50_000 })) });
  } catch (err) {
    await logEvent("error", "tick_failed", { message: err.message });
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
