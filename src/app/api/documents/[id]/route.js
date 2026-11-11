// src/app/api/documents/[id]/route.js
import { NextResponse } from "next/server";
import { api, HttpError, json, routeId } from "@/server/http";
import { deleteDocument, getDocument } from "@/server/documents";

// Inline preview / download of a stored document (served from our own origin, behind the login).
export const GET = api(async (request, ctx) => {
  const doc = await getDocument(await routeId(ctx));
  if (!doc) throw new HttpError(404, "Document not found");
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(doc.content, {
    headers: {
      "content-type": doc.mime,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${doc.filename.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
    },
  });
});

export const DELETE = api(async (request, ctx) => {
  await deleteDocument(await routeId(ctx));
  return json({ ok: true });
});
