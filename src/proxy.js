// src/proxy.js
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./server/session.js";

// Everything is behind a single-owner login except: the login page/endpoint, and the cron endpoint
// (which authenticates itself with a bearer secret). Set PUBLIC_OVERVIEW=true to leave the original
// dashboard at "/" open exactly as it was before the login was added.
const OPEN = [/^\/login$/, /^\/api\/auth\/login$/, /^\/api\/cron\//];

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (OPEN.some((re) => re.test(pathname))) return NextResponse.next();
  if (pathname === "/" && process.env.PUBLIC_OVERVIEW === "true") return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = await verifySessionToken(token, (process.env.SESSION_SECRET || "").trim());

  if (!signedIn) {
    if (isApi) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // CSRF defence in depth on top of SameSite=Lax: state-changing API calls must come from our own origin.
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    let ok = false;
    try {
      ok = Boolean(origin && host && new URL(origin).host === host);
    } catch {}
    if (!ok) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};