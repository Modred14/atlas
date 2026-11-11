// src/server/gmail.js
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { one, query } from "./db.js";
import { decrypt, encrypt } from "./crypto.js";

const SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send";
const SCOPE_READ = "https://www.googleapis.com/auth/gmail.readonly";
const SCOPES = ["openid", "email", SCOPE_SEND, SCOPE_READ];
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  constructor(message, { status = 502, retryable = false, reauth = false, quota = false, config = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.reauth = reauth;
    this.quota = quota;
    this.config = config;
  }
}

export function allowedAccount() {
  return (process.env.GMAIL_ALLOWED_ACCOUNT || "favourdomirin@gmail.com").toLowerCase();
}

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  const missing = [!clientId && "GOOGLE_CLIENT_ID", !clientSecret && "GOOGLE_CLIENT_SECRET", !appUrl && "APP_URL"].filter(Boolean);
  if (missing.length) {
    throw new GmailError(`Gmail is not configured. Set ${missing.join(", ")} (see the README).`, { status: 400, config: true });
  }
  return { clientId, clientSecret, redirectUri: `${appUrl.replace(/\/$/, "")}/api/gmail/callback` };
}

export function buildAuthUrl(state) {
  const { clientId, redirectUri } = oauthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: allowedAccount(),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const invalidGrant = data.error === "invalid_grant";
    throw new GmailError(
      invalidGrant
        ? "Google rejected the saved Gmail authorisation (expired or revoked). Reconnect Gmail in Settings."
        : `Google token error: ${data.error_description || data.error || res.status}`,
      { status: invalidGrant ? 401 : 502, reauth: invalidGrant },
    );
  }
  return data;
}

export async function completeOAuth(code) {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  const tok = await tokenRequest({
    code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code",
  });
  const scopes = String(tok.scope || "");
  if (!scopes.includes(SCOPE_SEND) || !scopes.includes(SCOPE_READ)) {
    throw new GmailError("Both Gmail permissions (send and read) are required. Reconnect and leave every box ticked.", { status: 400 });
  }
  if (!tok.refresh_token) {
    throw new GmailError(
      "Google did not return a refresh token. Remove Atlas at myaccount.google.com/permissions, then connect again.",
      { status: 400 },
    );
  }
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tok.access_token}` },
    signal: AbortSignal.timeout(15_000),
  }).then((r) => r.json());
  const email = String(info.email || "").toLowerCase();
  if (email !== allowedAccount()) {
    // Don't keep tokens for the wrong account.
    await revoke(tok.refresh_token);
    throw new GmailError(`Connected to ${email || "an unknown account"}, but only ${allowedAccount()} is allowed.`, { status: 400 });
  }
  await query(
    `insert into gmail_account (id, email, refresh_token_enc, access_token_enc, access_expires_at, scopes, status, last_error, connected_at, updated_at)
     values (1, $1, $2, $3, now() + ($4 || ' seconds')::interval, $5, 'connected', null, now(), now())
     on conflict (id) do update set email = excluded.email, refresh_token_enc = excluded.refresh_token_enc,
       access_token_enc = excluded.access_token_enc, access_expires_at = excluded.access_expires_at,
       scopes = excluded.scopes, status = 'connected', last_error = null, connected_at = now(), updated_at = now()`,
    [email, encrypt(tok.refresh_token), encrypt(tok.access_token), String(tok.expires_in || 3600), scopes],
  );
  return email;
}

export async function getAccount() {
  return one("select email, status, last_error, scopes, connected_at, access_expires_at from gmail_account where id = 1");
}

async function refreshAccessToken(account) {
  const { clientId, clientSecret } = oauthConfig();
  try {
    const tok = await tokenRequest({
      refresh_token: decrypt(account.refresh_token_enc),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    });
    await query(
      `update gmail_account set access_token_enc = $1, access_expires_at = now() + ($2 || ' seconds')::interval,
         status = 'connected', last_error = null, updated_at = now() where id = 1`,
      [encrypt(tok.access_token), String(tok.expires_in || 3600)],
    );
    return tok.access_token;
  } catch (err) {
    if (err.reauth) {
      await query("update gmail_account set status = 'reauth_required', last_error = $1, updated_at = now() where id = 1", [err.message]);
    }
    throw err;
  }
}

async function getAccessToken({ force = false } = {}) {
  const account = await one("select * from gmail_account where id = 1");
  if (!account) throw new GmailError("Gmail is not connected. Connect it in Settings → Gmail.", { status: 400, config: true });
  if (account.status === "reauth_required") {
    throw new GmailError("Gmail needs to be reconnected. Open Settings → Gmail.", { status: 401, reauth: true });
  }
  const valid = account.access_token_enc && account.access_expires_at && new Date(account.access_expires_at).getTime() > Date.now() + 120_000;
  if (!force && valid) return decrypt(account.access_token_enc);
  return refreshAccessToken(account);
}

function classifyApiError(status, data) {
  const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || "";
  const message = data?.error?.message || `Gmail API error ${status}`;
  if (status === 401) return new GmailError("Gmail authorisation failed. Reconnect Gmail in Settings.", { status: 401, reauth: true });
  if (status === 429 || /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded|RESOURCE_EXHAUSTED/i.test(reason)) {
    return new GmailError(`Gmail sending/usage limit reached (${reason || status}). Sending is paused until it resets.`, { status: 429, quota: true, retryable: true });
  }
  if (status === 403) {
    return new GmailError(`Gmail refused the request: ${message}`, { status: 403, reauth: /insufficient|scope/i.test(message) });
  }
  if (status >= 500) return new GmailError(`Gmail is having trouble (${status}). Will retry.`, { status: 502, retryable: true });
  return new GmailError(message, { status: status === 404 ? 404 : 400 });
}

async function gmailFetch(path, { method = "GET", body, search } = {}) {
  const url = `${API}${path}${search ? `?${new URLSearchParams(search)}` : ""}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken({ force: attempt === 1 });
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new GmailError(`Could not reach Gmail: ${err.message}`, { retryable: true });
    }
    if (res.status === 401 && attempt === 0) continue;
    const data = await res.json().catch(() => null);
    if (res.ok) return data;
    throw classifyApiError(res.status, data);
  }
  throw new GmailError("Gmail authorisation failed. Reconnect Gmail in Settings.", { status: 401, reauth: true });
}

export function buildRaw({ fromName, fromEmail, to, toName, subject, text, html, attachments = [], inReplyTo, references, headers = {} }) {
  const composer = new MailComposer({
    from: { name: fromName, address: fromEmail },
    to: toName ? { name: toName, address: to } : to,
    subject,
    text,
    html,
    attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    inReplyTo,
    references,
    headers,
  });
  return new Promise((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) return reject(err);
      resolve(message.toString("base64url"));
    });
  });
}

export async function sendRaw(raw, threadId) {
  return gmailFetch("/messages/send", { method: "POST", body: { raw, ...(threadId ? { threadId } : {}) } });
}

export function listMessages({ q, pageToken, maxResults = 100 }) {
  return gmailFetch("/messages", {
    search: { q, maxResults: String(maxResults), ...(pageToken ? { pageToken } : {}) },
  });
}

function header(headers, name) {
  return (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBody(data) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n");
}

function extractText(payload) {
  const plain = [];
  const html = [];
  (function walk(part) {
    if (!part) return;
    const mime = part.mimeType || "";
    if (mime === "text/plain" && part.body?.data) plain.push(decodeBody(part.body.data));
    else if (mime === "text/html" && part.body?.data) html.push(decodeBody(part.body.data));
    (part.parts || []).forEach(walk);
  })(payload);
  return (plain.join("\n") || htmlToText(html.join("\n"))).trim();
}

// Drops the quoted history so classification and reply drafting see only the new text.
export function stripQuoted(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const line of lines) {
    if (/^>/.test(line)) continue;
    if (/^On .{5,200}wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From:\s.+/.test(line) && out.length) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

export async function getMessage(id, { metadataOnly = false } = {}) {
  const msg = await gmailFetch(`/messages/${id}`, {
    search: metadataOnly
      ? { format: "metadata", metadataHeaders: ["Message-ID", "From", "Subject", "Auto-Submitted", "X-Failed-Recipients"].join(",") }
      : { format: "full" },
  });
  const h = msg.payload?.headers || [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet || "",
    receivedAt: new Date(Number(msg.internalDate) || Date.now()),
    from: header(h, "From"),
    subject: header(h, "Subject"),
    rfcMessageId: header(h, "Message-ID") || header(h, "Message-Id"),
    autoSubmitted: header(h, "Auto-Submitted"),
    failedRecipients: header(h, "X-Failed-Recipients"),
    labelIds: msg.labelIds || [],
    text: metadataOnly ? "" : extractText(msg.payload).slice(0, 20_000),
  };
}

export function parseFrom(value) {
  const m = /^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/.exec(String(value).trim());
  if (m) return { name: (m[1] || "").trim(), email: m[2].trim().toLowerCase() };
  return { name: "", email: String(value).trim().toLowerCase() };
}

export async function getProfileInfo() {
  return gmailFetch("/profile");
}

async function revoke(token) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* best effort */
  }
}

export async function disconnect() {
  const account = await one("select refresh_token_enc from gmail_account where id = 1");
  if (account) {
    try {
      await revoke(decrypt(account.refresh_token_enc));
    } catch {}
  }
  await query("delete from gmail_account where id = 1");
}
