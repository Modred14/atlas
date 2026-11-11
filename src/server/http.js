// src/server/http.js
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session.js";
import { logEvent } from "./log.js";

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const json = (data, init) => NextResponse.json(data, init);

export async function requireSession(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, process.env.SESSION_SECRET))) {
    throw new HttpError(401, "Not signed in");
  }
}

// Wraps a route handler: session check (defence in depth behind proxy.js), uniform error JSON.
// Errors carrying a numeric `status` (HttpError, RateLimitError, AiError, GmailError) are shown to the
// owner; anything else is logged and reported generically.
export function api(handler, { auth = true } = {}) {
  return async (request, ctx) => {
    try {
      if (auth) await requireSession(request);
      return await handler(request, ctx);
    } catch (err) {
      if (err?.name === "ZodError") {
        return NextResponse.json(
          {
            error: "Invalid input",
            issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 400 },
        );
      }
      if (typeof err?.status === "number") {
        return NextResponse.json({ error: err.message, ...(err.extra || {}) }, { status: err.status });
      }
      const path = request.nextUrl?.pathname;
      await logEvent("error", "api_error", { path, method: request.method, message: err?.message });
      return NextResponse.json(
        { error: err?.exposeMessage ? err.message : "Something went wrong on the server. Check the logs." },
        { status: 500 },
      );
    }
  };
}

export async function readJson(request, schema) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  return schema ? schema.parse(body) : body;
}

export async function routeId(ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
}

export function clientIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
