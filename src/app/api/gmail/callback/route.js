// src/app/api/gmail/callback/route.js
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { completeOAuth } from "@/server/gmail";
import { logEvent } from "@/server/log";

export const GET = api(async (request) => {
  const params = request.nextUrl.searchParams;
  const back = (query) => {
    const res = NextResponse.redirect(new URL(`/settings?tab=gmail&${query}`, request.url));
    res.cookies.set("atlas_oauth_state", "", { path: "/api/gmail", maxAge: 0 });
    return res;
  };

  const cookie = request.cookies.get("atlas_oauth_state")?.value || "";
  const state = params.get("state") || "";
  const valid = cookie.length > 20 && cookie.length === state.length && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(state));
  if (!valid) return back("gmail_error=" + encodeURIComponent("Sign-in expired or was tampered with. Please try again."));
  if (params.get("error")) return back("gmail_error=" + encodeURIComponent(`Google: ${params.get("error")}`));
  const code = params.get("code");
  if (!code) return back("gmail_error=" + encodeURIComponent("Google did not return an authorisation code."));

  try {
    const email = await completeOAuth(code);
    await logEvent("info", "gmail_connected", { email });
    return back("gmail=connected");
  } catch (err) {
    await logEvent("warn", "gmail_connect_failed", { message: err.message });
    return back("gmail_error=" + encodeURIComponent(err.message));
  }
});
