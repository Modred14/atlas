// src/app/api/gmail/connect/route.js
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { buildAuthUrl } from "@/server/gmail";

// Starts Google OAuth. The random state is bound to this browser through an HttpOnly cookie (CSRF).
export const GET = api(async (request) => {
  let url;
  const state = crypto.randomBytes(24).toString("base64url");
  try {
    url = buildAuthUrl(state);
  } catch (err) {
    return NextResponse.redirect(new URL(`/settings?tab=gmail&gmail_error=${encodeURIComponent(err.message)}`, request.url));
  }
  const res = NextResponse.redirect(url);
  res.cookies.set("atlas_oauth_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/gmail", maxAge: 600,
  });
  return res;
});
