// src/server/util.js
import crypto from "node:crypto";

export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  const v = normalizeEmail(email);
  return v.length <= 254 && EMAIL_RE.test(v);
}

export function emailDomain(email) {
  return normalizeEmail(email).split("@")[1] || "";
}

const SUFFIX = /\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|company|plc|ag|sa|bv|pty|pvt|oy|ab)\b/g;

// "Acme, Inc." and "ACME Ltd" collapse to the same key so a company is never added twice.
export function companyKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hostFromUrl(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeWebsite(url) {
  const host = hostFromUrl(url);
  return host ? `https://${host}` : null;
}

// True when `email` belongs to `domain` or one of its subdomains.
export function domainMatches(email, domain) {
  const d = emailDomain(email);
  return Boolean(d && domain && (d === domain || d.endsWith(`.${domain}`)));
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtml(text) {
  const paras = String(text)
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) =>
      escapeHtml(p)
        .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>')
        .replace(/\n/g, "<br>"),
    );
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">${paras
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join("")}</div>`;
}

export function wordCount(text) {
  return (String(text).match(/\S+/g) || []).length;
}

export function firstName(full) {
  return String(full || "").trim().split(/\s+/)[0] || "";
}

export function hourInTz(date, timeZone) {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(date);
  return Number(h) % 24;
}

export function csvCell(value) {
  let s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function merge(defaults, saved) {
  if (saved === undefined || saved === null) return defaults;
  if (Array.isArray(defaults) || Array.isArray(saved)) return saved;
  if (typeof defaults === "object" && defaults && typeof saved === "object") {
    const out = { ...defaults };
    for (const k of Object.keys(saved)) out[k] = merge(defaults[k], saved[k]);
    return out;
  }
  return saved;
}
