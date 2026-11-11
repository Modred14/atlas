// src/app/api/auth/logout/route.js
import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session";

export const POST = api(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
