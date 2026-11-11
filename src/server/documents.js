// src/server/documents.js
import { one, query, rows, tx } from "./db.js";
import { safeFetch } from "./safe-fetch.js";
import { getRaw, getSetting, setSetting } from "./settings.js";
import { logEvent } from "./log.js";
import { sha256 } from "./util.js";

export const MAX_DOC_BYTES = 5 * 1024 * 1024;

const ALLOWED_OTHER = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

class DocError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const isPdf = (buf) => buf.length > 4 && buf.subarray(0, 5).toString("latin1").startsWith("%PDF-");

export function listDocuments() {
  return rows(
    "select id, kind, filename, mime, size, sha256, source, source_url, is_default, created_at from documents order by is_default desc, created_at desc",
  );
}

export async function getDocument(id) {
  return one("select * from documents where id = $1", [id]);
}

export async function saveDocument({ kind, filename, mime, buffer, source, sourceUrl = null, makeDefault = false }) {
  if (buffer.length === 0) throw new DocError("The file is empty");
  if (buffer.length > MAX_DOC_BYTES) throw new DocError("File is larger than 5 MB");
  const safeName = String(filename || "document").replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  if (kind === "cv") {
    if (!isPdf(buffer)) throw new DocError("The CV must be a PDF file");
    mime = "application/pdf";
  } else if (!ALLOWED_OTHER.has(mime)) {
    throw new DocError("Only PDF, DOCX or plain-text documents are supported");
  }
  const hash = sha256(buffer);
  return tx(async (db) => {
    if (kind === "cv" && makeDefault) await db.query("update documents set is_default = false where kind = 'cv'");
    const res = await db.query(
      `insert into documents (kind, filename, mime, size, sha256, content, source, source_url, is_default)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, kind, filename, mime, size, sha256, source, source_url, is_default, created_at`,
      [kind, safeName, mime, buffer.length, hash, buffer, source, sourceUrl, kind === "cv" && makeDefault],
    );
    return res.rows[0];
  });
}

export async function deleteDocument(id) {
  await query("delete from documents where id = $1", [id]);
}

export async function getDefaultCv() {
  return one("select * from documents where kind = 'cv' and is_default limit 1");
}

export async function cvSource() {
  const cfg = await getSetting("cv");
  return (cfg.sourceUrl || process.env.CV_SOURCE_URL || "").trim();
}

function filenameFrom(disposition, url) {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition || "");
  if (m) return decodeURIComponent(m[1]);
  const last = new URL(url).pathname.split("/").filter(Boolean).pop();
  return last && /\.pdf$/i.test(last) ? last : "Favour_Omirin_CV.pdf";
}

// Pulls the CV from the owner's own CV generator (modred.dev) and keeps the newest copy as the default.
// A failed refresh keeps the last good copy, so an outage on the portfolio never blocks sending.
export async function syncCv({ force = false } = {}) {
  const url = await cvSource();
  if (!url) throw new DocError("No CV source URL is configured. Add it in Settings → Documents.");
  const cfg = await getSetting("cv");
  const state = (await getRaw("cv_sync")) || {};
  const current = await getDefaultCv();

  const fresh =
    state.checkedAt && state.ok && Date.now() - new Date(state.checkedAt).getTime() < cfg.cacheMinutes * 60_000;
  if (!force && fresh && current) return { cv: current, changed: false, cached: true };

  try {
    const res = await safeFetch(url, { timeoutMs: 25_000, maxBytes: MAX_DOC_BYTES, headers: { accept: "application/pdf" } });
    if (!res.ok) throw new DocError(`The CV source answered HTTP ${res.status}`, 502);
    if (!isPdf(res.body)) {
      throw new DocError(
        "The CV source did not return a PDF. If the CV is generated in the browser there is no file to fetch; the portfolio needs a route that returns the PDF.",
        502,
      );
    }
    const hash = sha256(res.body);
    let cv = current;
    let changed = false;
    if (!current || current.sha256 !== hash) {
      const saved = await saveDocument({
        kind: "cv",
        filename: filenameFrom(res.contentDisposition, res.url),
        mime: "application/pdf",
        buffer: res.body,
        source: "sync",
        sourceUrl: url,
        makeDefault: true,
      });
      cv = await getDefaultCv();
      changed = true;
      await query(
        `delete from documents where kind = 'cv' and source = 'sync' and not is_default and id not in (
           select id from documents where kind = 'cv' and source = 'sync' order by created_at desc limit 3)`,
      );
      await logEvent("info", "cv_synced", { id: saved.id, size: saved.size });
    }
    await setSetting("cv_sync", { checkedAt: new Date().toISOString(), ok: true, sha256: hash });
    return { cv, changed, cached: false };
  } catch (err) {
    await setSetting("cv_sync", {
      checkedAt: new Date().toISOString(),
      ok: false,
      error: err.message,
      sha256: state.sha256 || null,
    });
    await logEvent("warn", "cv_sync_failed", { message: err.message });
    throw err;
  }
}

// Used at send time: refresh from the generator when one is configured, else use the uploaded copy.
export async function ensureFreshCv() {
  if (await cvSource()) {
    try {
      await syncCv();
    } catch {
      /* fall through to the last good copy */
    }
  }
  const cv = await getDefaultCv();
  if (!cv) {
    throw new DocError("CV attachment is enabled but no CV is available. Set a CV source or upload one in Settings → Documents.");
  }
  return cv;
}
