// src/app/api/documents/route.js
import { api, HttpError, json } from "@/server/http";
import { listDocuments, saveDocument } from "@/server/documents";

export const maxDuration = 30;

export const GET = api(async () => json({ documents: await listDocuments() }));

// multipart upload: field "file", plus "kind" = cv | other
export const POST = api(async (request) => {
  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "cv" ? "cv" : "other";
  if (!file || typeof file === "string") throw new HttpError(400, "Choose a file to upload");
  if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "File is larger than 5 MB");
  const buffer = Buffer.from(await file.arrayBuffer());
  const doc = await saveDocument({
    kind, filename: file.name, mime: file.type, buffer, source: "upload", makeDefault: kind === "cv",
  });
  return json({ ok: true, document: doc });
});
