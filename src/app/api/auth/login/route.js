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
    const secret = (process.env.SESSION_SECRET || "").trim();
    if (!stored || !secret) {
      throw new HttpError(500, "Login is not configured. Set ADMIN_PASSWORD_HASH and SESSION_SECRET (see the README).");
    }
    if (secret.length < 32) {
      throw new HttpError(500, "SESSION_SECRET must be at least 32 characters. Run `npm run gen-secrets`.");
    }
    // 8 attempts per 15 minutes per IP. If the rate-limit table is unavailable (e.g. migrations not
    // run), don't lock the owner out: only a real 429 blocks the attempt.
    try {
      await rateLimit(`login:${clientIp(request)}`, 8, 900);
    } catch (err) {
      if (err?.status === 429) throw err;
      console.error("login rate limit unavailable:", err?.message);
    }
    const { password } = await readJson(request, schema);
    if (!verifyPassword(password, stored)) throw new HttpError(401, "Incorrect password");

    // A Secure cookie is silently dropped by the browser on plain http (e.g. `npm start` on
    // localhost), which looks like "login succeeds but I'm sent back to /login". Decide per request.
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || request.nextUrl.protocol.replace(":", "");
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
      httpOnly: true,
      secure: proto === "https",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  },
  { auth: false },
);