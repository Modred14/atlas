// src/server/outreach.js
import { one, query, rows } from "./db.js";
import { getRaw, getSetting, setSetting } from "./settings.js";
import { getProfile } from "./profile.js";
import { buildRaw, getAccount, getMessage, sendRaw } from "./gmail.js";
import { ensureFreshCv, getDocument } from "./documents.js";
import { logEvent } from "./log.js";
import { lintEmail } from "./ai/writer.js";
import { emailDomain, hourInTz, isValidEmail, normalizeEmail, sha256, textToHtml } from "./util.js";

export class SendError extends Error {
  constructor(message, { status = 400, quota = false } = {}) {
    super(message);
    this.status = status;
    this.quota = quota;
  }
}

// What the owner saw and approved is exactly what gets sent: the hash covers every field that reaches
// the recipient. Any edit changes the hash and voids a previous confirmation or approval.
export function contentHash(row) {
  const ids = [...(row.attachment_ids || row.attachmentIds || [])].map(Number).sort((a, b) => a - b);
  return sha256(
    JSON.stringify([normalizeEmail(row.to_email ?? row.toEmail), row.subject, row.body, Boolean(row.attach_cv ?? row.attachCv), ids]),
  );
}

export async function createOutreach(f) {
  const fields = {
    campaign_id: f.campaignId ?? null,
    company_id: f.companyId ?? null,
    contact_id: f.contactId ?? null,
    kind: f.kind,
    to_email: normalizeEmail(f.toEmail),
    to_name: f.toName || null,
    subject: f.subject,
    body: f.body,
    attach_cv: Boolean(f.attachCv),
    attachment_ids: f.attachmentIds || [],
  };
  return one(
    `insert into outreach (campaign_id, company_id, contact_id, kind, to_email, to_name, subject, body, attach_cv,
       attachment_ids, status, content_hash, parent_outreach_id, reply_to_message_id, gmail_thread_id, lint, generation)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb) returning *`,
    [
      fields.campaign_id, fields.company_id, fields.contact_id, fields.kind, fields.to_email, fields.to_name,
      fields.subject, fields.body, fields.attach_cv, JSON.stringify(fields.attachment_ids),
      f.status || "draft", contentHash(fields), f.parentId ?? null, f.replyToMessageId ?? null, f.threadId ?? null,
      f.lint ? JSON.stringify(f.lint) : null, f.generation ? JSON.stringify(f.generation) : null,
    ],
  );
}

export function getOutreach(id) {
  return one(
    `select o.*, c.name as company_name, c.website as company_website
     from outreach o left join companies c on c.id = o.company_id where o.id = $1`,
    [id],
  );
}

export function listOutreach({ statuses, kinds, campaignId, search, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (statuses?.length) { params.push(statuses); where.push(`o.status = any($${params.length}::text[])`); }
  if (kinds?.length) { params.push(kinds); where.push(`o.kind = any($${params.length}::text[])`); }
  if (campaignId) { params.push(campaignId); where.push(`o.campaign_id = $${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(lower(o.to_email) like $${params.length} or lower(o.subject) like $${params.length} or lower(coalesce(c.name,'')) like $${params.length})`);
  }
  params.push(Math.min(limit, 500), offset);
  return rows(
    `select o.id, o.kind, o.status, o.to_email, o.to_name, o.subject, o.body, o.attach_cv, o.error, o.lint, o.generation,
            o.sent_at, o.created_at, o.approved_at, o.campaign_id, o.company_id, o.contact_id, o.attempts,
            c.name as company_name, k.verification as contact_verification, cp.name as campaign_name
     from outreach o
     left join companies c on c.id = o.company_id
     left join contacts k on k.id = o.contact_id
     left join campaigns cp on cp.id = o.campaign_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by coalesce(o.sent_at, o.created_at) desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}

const EDITABLE = ["draft", "pending_approval", "approved", "failed"];

export async function editOutreach(id, patch) {
  const row = await one("select * from outreach where id = $1", [id]);
  if (!row) throw new SendError("Email not found", { status: 404 });
  if (!EDITABLE.includes(row.status)) throw new SendError(`A "${row.status}" email cannot be edited.`, { status: 409 });
  const next = {
    to_email: patch.toEmail !== undefined ? normalizeEmail(patch.toEmail) : row.to_email,
    to_name: patch.toName !== undefined ? patch.toName || null : row.to_name,
    subject: patch.subject ?? row.subject,
    body: patch.body ?? row.body,
    attach_cv: patch.attachCv ?? row.attach_cv,
    attachment_ids: patch.attachmentIds ?? row.attachment_ids,
  };
  if (!isValidEmail(next.to_email)) throw new SendError("Recipient email is not valid", { status: 400 });
  const campaignKind = row.kind === "outreach" || row.kind === "followup";
  // Any edit voids approval. Failed emails come back for review.
  const status = row.status === "approved" || row.status === "failed" ? (campaignKind ? "pending_approval" : "draft") : row.status;
  const company = row.company_id ? await one("select name, domain from companies where id = $1", [row.company_id]) : null;
  const lint = lintEmail({
    subject: next.subject, body: next.body, kind: row.kind, profile: await getProfile(),
    companyName: company?.name, companyHost: company?.domain,
  });
  return one(
    `update outreach set to_email=$2, to_name=$3, subject=$4, body=$5, attach_cv=$6, attachment_ids=$7::jsonb,
       status=$8, content_hash=$9, approved_at = null, lint=$10::jsonb, error = null, updated_at = now()
     where id = $1 returning *`,
    [id, next.to_email, next.to_name, next.subject, next.body, next.attach_cv, JSON.stringify(next.attachment_ids), status, contentHash(next), JSON.stringify(lint)],
  );
}

export async function approveOutreach(ids) {
  const out = { approved: 0, skipped: [] };
  for (const id of ids) {
    const row = await one("select id, to_email, status from outreach where id = $1", [id]);
    if (!row || row.status !== "pending_approval") { out.skipped.push({ id, reason: "not awaiting approval" }); continue; }
    const sup = await isSuppressed(row.to_email);
    if (sup) { out.skipped.push({ id, reason: "recipient is on the suppression list" }); continue; }
    await query("update outreach set status='approved', approved_at=now(), updated_at=now() where id=$1 and status='pending_approval'", [id]);
    out.approved++;
  }
  return out;
}

export async function rejectOutreach(ids, reason = "Rejected by owner") {
  await query(
    "update outreach set status='rejected', error=$2, updated_at=now() where id = any($1::bigint[]) and status in ('draft','pending_approval','approved')",
    [ids, reason],
  );
}

export function isSuppressed(email) {
  const e = normalizeEmail(email);
  return one(
    "select kind, value, reason from suppression where (kind='email' and value=$1) or (kind='domain' and value=$2) limit 1",
    [e, emailDomain(e)],
  );
}

export async function addSuppression(kind, value, reason) {
  const v = kind === "email" ? normalizeEmail(value) : String(value).trim().toLowerCase().replace(/^@/, "");
  await query("insert into suppression (kind, value, reason) values ($1,$2,$3) on conflict (kind, value) do nothing", [kind, v, reason]);
}

export function sendStats(tz) {
  return one(
    `select
       count(*) filter (where (sent_at at time zone $1)::date = (now() at time zone $1)::date) as today,
       count(*) filter (where sent_at > now() - interval '1 hour') as last_hour,
       max(sent_at) as last_sent,
       min(sent_at) as first_sent
     from outreach where status in ('sent','bounced') and sent_at is not null`,
    [tz],
  );
}

export function effectiveDailyLimit({ target, safety, firstSent }) {
  let limit = Math.min(target, safety.dailyHardCap);
  if (safety.warmup) {
    const days = firstSent ? Math.floor((Date.now() - new Date(firstSent).getTime()) / 86_400_000) : 0;
    limit = Math.min(limit, 10 + days * 5); // new sending patterns are ramped up gradually
  }
  return Math.max(1, limit);
}

export async function canSendNow({ target }) {
  const safety = await getSetting("safety");
  const tz = safety.sendWindow.timezone;
  const pause = await getRaw("send_pause");
  if (pause && new Date(pause.until) > new Date()) return { ok: false, reason: `Paused: ${pause.reason}` };
  const hour = hourInTz(new Date(), tz);
  if (hour < safety.sendWindow.startHour || hour >= safety.sendWindow.endHour) {
    return { ok: false, reason: `Outside the sending window (${safety.sendWindow.startHour}:00–${safety.sendWindow.endHour}:00 ${tz})` };
  }
  const stats = await sendStats(tz);
  const limit = effectiveDailyLimit({ target, safety, firstSent: stats.first_sent });
  if (stats.today >= limit) return { ok: false, reason: `Daily limit reached (${stats.today}/${limit})` };
  if (stats.last_hour >= safety.maxPerHour) return { ok: false, reason: `Hourly limit reached (${stats.last_hour}/${safety.maxPerHour})` };
  if (stats.last_sent && Date.now() - new Date(stats.last_sent).getTime() < safety.minIntervalSec * 1000) {
    return { ok: false, reason: "Waiting between sends" };
  }
  return { ok: true, limit, today: stats.today };
}

async function failure(row, err, manual) {
  const quota = Boolean(err.quota);
  const hold = err.reauth || err.config || quota || (err.retryable && row.attempts < 3);
  const status = hold ? (manual ? "draft" : "approved") : "failed";
  if (quota) {
    await setSetting("send_pause", { until: new Date(Date.now() + 2 * 3600_000).toISOString(), reason: err.message });
  }
  await query("update outreach set status=$2, error=$3, updated_at=now() where id=$1", [row.id, status, err.message]);
  await logEvent(hold ? "warn" : "error", "email_send_failed", { id: row.id, message: err.message, quota, reauth: Boolean(err.reauth) });
  return { ok: false, error: err.message, quota, reauth: Boolean(err.reauth), status };
}

// The only code path that sends mail. `manual` sends (Email Studio, replies) require the hash the owner
// confirmed; queue sends require prior approval of the identical content.
export async function sendOutreach(id, { confirmedHash = null, manual = false } = {}) {
  const row = await one("select * from outreach where id = $1", [id]);
  if (!row) throw new SendError("Email not found", { status: 404 });
  const allowed = manual ? ["draft", "failed"] : ["approved"];
  if (!allowed.includes(row.status)) throw new SendError(`This email is "${row.status}" and cannot be sent.`, { status: 409 });
  const hash = contentHash(row);
  if (manual) {
    if (!confirmedHash || confirmedHash !== hash) {
      throw new SendError("The email changed after it was shown for confirmation. Review it and confirm again.", { status: 409 });
    }
  } else if (row.content_hash !== hash || !row.approved_at) {
    throw new SendError("This email's content changed after approval and needs to be approved again.", { status: 409 });
  }

  const to = normalizeEmail(row.to_email);
  if (!isValidEmail(to)) throw new SendError("Recipient email is not valid", { status: 400 });
  const sup = await isSuppressed(to);
  if (sup) throw new SendError(`${to} is on the suppression list (${sup.reason || sup.kind}) and will not be contacted.`, { status: 409 });
  if (row.kind === "outreach") {
    const dup = await one(
      `select id from outreach where id <> $1 and kind = 'outreach' and lower(to_email) = $2
         and status in ('sent','sending','bounced') and coalesce(sent_at, updated_at) > now() - interval '90 days' limit 1`,
      [id, to],
    );
    if (dup) throw new SendError("An outreach email to this address was already sent in the last 90 days.", { status: 409 });
  }
  const safety = await getSetting("safety");
  const stats = await sendStats(safety.sendWindow.timezone);
  if (stats.today >= safety.dailyHardCap) throw new SendError(`Daily cap of ${safety.dailyHardCap} emails reached.`, { status: 429, quota: true });
  const pause = await getRaw("send_pause");
  if (pause && new Date(pause.until) > new Date()) throw new SendError(`Sending is paused: ${pause.reason}`, { status: 429, quota: true });

  const claimed = await one(
    "update outreach set status='sending', attempts = attempts + 1, error = null, updated_at = now() where id = $1 and status = any($2::text[]) returning *",
    [id, allowed],
  );
  if (!claimed) throw new SendError("This email is already being sent.", { status: 409 });

  try {
    const [profile, account] = await Promise.all([getProfile(), getAccount()]);
    const attachments = [];
    if (claimed.attach_cv) {
      const cv = await ensureFreshCv();
      attachments.push({ filename: cv.filename, content: cv.content, contentType: cv.mime });
    }
    for (const docId of claimed.attachment_ids || []) {
      const d = await getDocument(docId);
      if (d) attachments.push({ filename: d.filename, content: d.content, contentType: d.mime });
    }
    const headers = {};
    if (claimed.kind === "outreach" || claimed.kind === "followup") {
      headers["List-Unsubscribe"] = `<mailto:${account?.email || profile.email}?subject=unsubscribe>`;
    }
    const raw = await buildRaw({
      fromName: profile.name,
      fromEmail: account?.email || profile.email,
      to,
      toName: claimed.to_name || undefined,
      subject: claimed.subject,
      text: claimed.body,
      html: textToHtml(claimed.body),
      attachments,
      inReplyTo: claimed.reply_to_message_id || undefined,
      references: claimed.reply_to_message_id || undefined,
      headers,
    });
    const sent = await sendRaw(raw, claimed.gmail_thread_id || undefined);
    let rfc = null;
    try {
      rfc = (await getMessage(sent.id, { metadataOnly: true })).rfcMessageId || null;
    } catch {
      /* threading id is best effort */
    }
    await query(
      `update outreach set status='sent', sent_at=now(), gmail_message_id=$2, gmail_thread_id=$3, rfc_message_id=$4,
         error=null, updated_at=now() where id=$1`,
      [id, sent.id, sent.threadId, rfc],
    );
    if (claimed.company_id && (claimed.kind === "outreach" || claimed.kind === "followup")) {
      await query(
        `update companies set last_contacted_at = now(), updated_at = now(),
           status = case when status in ('discovered','researched','ready_for_outreach','no_response') then 'email_sent' else status end
         where id = $1`,
        [claimed.company_id],
      );
    }
    await logEvent("info", "email_sent", { id, kind: claimed.kind });
    return { ok: true, id, gmailMessageId: sent.id, threadId: sent.threadId };
  } catch (err) {
    return failure(claimed, err, manual);
  }
}

// A crashed send leaves "sending" behind. Never auto-retry: the outcome is unknown and a retry could
// double-send, so it needs a human to check Gmail's Sent folder.
export async function reapStaleSending() {
  await query(
    `update outreach set status='failed', error='Send was interrupted and the outcome is unknown. Check Gmail Sent before retrying.', updated_at=now()
     where status='sending' and updated_at < now() - interval '10 minutes'`,
  );
}
