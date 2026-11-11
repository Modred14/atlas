// src/app/api/auth/login/route.js
import { z } from "zod";
import { NextResponse } from "next/server";
import { api, clientIp, HttpError, readJson } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { verifyPassword } from "@/server/password";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/session";

const schema = z.object({ password: z.string().min(1).max(200) });

export const POST = api(
  async (request) => {
    const stored = process.env.ADMIN_PASSWORD_HASH;
    if (!stored || !process.env.SESSION_SECRET) {
      throw new HttpError(500, "Login is not configured. Set ADMIN_PASSWORD_HASH and SESSION_SECRET (see the README).");
    }
    // 8 attempts per 15 minutes per IP.
    await rateLimit(`login:${clientIp(request)}`, 8, 900);
    const { password } = await readJson(request, schema);
    if (!verifyPassword(password, stored)) throw new HttpError(401, "Incorrect password");

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(process.env.SESSION_SECRET), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  },
  { auth: false },
);
