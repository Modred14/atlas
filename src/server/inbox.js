// src/server/inbox.js
import { one, query, rows } from "./db.js";
import { getRaw, setSetting } from "./settings.js";
import { getAccount, getMessage, listMessages, parseFrom, stripQuoted } from "./gmail.js";
import { classifyReply } from "./ai/writer.js";
import { addSuppression } from "./outreach.js";
import { emailDomain, normalizeEmail } from "./util.js";
import { logEvent } from "./log.js";

const OPT_OUT = /\b(unsubscribe|remove me|stop (emailing|contacting|sending)|do not (contact|email)|don'?t (contact|email)|no thanks|not interested,? please|take me off)\b/i;
const AUTO = /\b(out of office|automatic reply|auto-?reply|autoreply|away from (the )?office|on leave)\b/i;

export function isBounce(msg) {
  const from = msg.from.toLowerCase();
  return /mailer-daemon|postmaster/.test(from) || /delivery status notification|undeliverable|mail delivery (failed|subsystem)|returned mail/i.test(msg.subject);
}

function bouncedAddress(msg) {
  const fromHeader = normalizeEmail(msg.failedRecipients || "");
  if (fromHeader.includes("@")) return fromHeader.split(/[,;\s]/)[0];
  const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(msg.text.replace(/mailer-daemon@\S+/gi, ""));
  return m ? normalizeEmail(m[0]) : null;
}

async function handleBounce(msg) {
  const addr = bouncedAddress(msg);
  if (!addr) return;
  const hard = /(550|551|553|554|5\.1\.1|5\.1\.2|user unknown|no such user|does not exist|address not found|unknown recipient|domain not found)/i.test(msg.text);
  const sent = await one(
    "select id, company_id, contact_id from outreach where lower(to_email) = $1 and status in ('sent','bounced') order by sent_at desc limit 1",
    [addr],
  );
  if (!sent) return;
  await query("update outreach set status = 'bounced', error = $2, updated_at = now() where id = $1", [
    sent.id, hard ? "Hard bounce: the address does not exist." : "Delivery failed (temporary or unclear).",
  ]);
  if (hard) {
    await query("update contacts set verification = 'invalid', verification_note = 'Hard bounce: mailbox does not exist.' where lower(email) = $1", [addr]);
    await addSuppression("email", addr, "Hard bounce");
  }
  await logEvent("warn", "email_bounced", { to: addr, hard });
}

async function ingest(id) {
  if (await one("select 1 as x from inbox_messages where gmail_message_id = $1", [id])) return null;
  const msg = await getMessage(id);
  const from = parseFrom(msg.from);
  const account = await getAccount();
  if (from.email === account?.email) return null; // our own sent mail in the thread

  if (isBounce(msg)) {
    await handleBounce(msg);
    await query(
      `insert into inbox_messages (gmail_message_id, thread_id, rfc_message_id, from_email, from_name, subject, snippet, body, received_at, category, category_reason, handled)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'bounce','Delivery failure notice',true) on conflict do nothing`,
      [msg.id, msg.threadId, msg.rfcMessageId, from.email, from.name, msg.subject, msg.snippet, msg.text.slice(0, 4000), msg.receivedAt],
    );
    return { bounce: true };
  }

  const sent = await one(
    `select id, company_id from outreach where gmail_thread_id = $1 and status in ('sent','bounced') order by sent_at desc limit 1`,
    [msg.threadId],
  );
  if (!sent) return null; // not a reply to anything Atlas sent, so it stays out of the inbox view

  const body = stripQuoted(msg.text);
  let category = "other";
  let reason = "";
  if (OPT_OUT.test(body)) {
    category = "opt_out";
    reason = "The sender asked not to be contacted again.";
    await addSuppression("email", from.email, "Opt-out reply");
    if (sent.company_id) {
      await query("update companies set status = 'do_not_contact', updated_at = now() where id = $1", [sent.company_id]);
      await query("update outreach set status = 'rejected', error = 'Recipient opted out', updated_at = now() where company_id = $1 and status in ('draft','pending_approval','approved')", [sent.company_id]);
    }
  } else if (AUTO.test(`${msg.subject}\n${body.slice(0, 400)}`) || /auto-replied|auto-generated/i.test(msg.autoSubmitted)) {
    category = "auto_reply";
    reason = "Automatic reply.";
  } else {
    try {
      ({ category, reason } = await classifyReply({ subject: msg.subject, body }));
    } catch (err) {
      reason = `Not classified: ${err.message}`;
    }
  }

  await query(
    `insert into inbox_messages (gmail_message_id, thread_id, rfc_message_id, from_email, from_name, subject, snippet, body, received_at, outreach_id, company_id, category, category_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict do nothing`,
    [msg.id, msg.threadId, msg.rfcMessageId, from.email, from.name, msg.subject, msg.snippet, body.slice(0, 8000), msg.receivedAt, sent.id, sent.company_id, category, reason],
  );

  if (sent.company_id && category !== "auto_reply" && category !== "opt_out") {
    const status = { rejection: "rejected", interested: "interested", interview: "interested" }[category] || "replied";
    await query(
      `update companies set status = $2, updated_at = now() where id = $1 and status not in ('do_not_contact')`,
      [sent.company_id, status],
    );
    if (category === "rejection") {
      await query("update outreach set status='rejected', error='Company declined', updated_at=now() where company_id=$1 and status in ('draft','pending_approval','approved')", [sent.company_id]);
    }
  }
  return { category };
}

// Looks only at mail newer than the last sync and only in threads Atlas started.
export async function syncInbox({ budgetMs = 20_000 } = {}) {
  const started = Date.now();
  const state = (await getRaw("inbox_sync")) || {};
  const since = state.lastSyncAt ? Math.floor(new Date(state.lastSyncAt).getTime() / 1000) - 3600 : Math.floor(Date.now() / 1000) - 30 * 86400;
  const q = `in:inbox after:${since} -from:me`;
  let pageToken;
  let seen = 0;
  let added = 0;
  const ids = [];
  do {
    const page = await listMessages({ q, pageToken, maxResults: 50 });
    ids.push(...(page.messages || []).map((m) => m.id));
    pageToken = page.nextPageToken;
    seen += (page.messages || []).length;
  } while (pageToken && seen < 200);

  for (const id of ids) {
    if (Date.now() - started > budgetMs) break;
    try {
      if (await ingest(id)) added++;
    } catch (err) {
      if (err.reauth || err.quota) throw err;
      await logEvent("warn", "inbox_message_failed", { id, message: err.message });
    }
  }
  await setSetting("inbox_sync", { lastSyncAt: new Date().toISOString(), added });
  return { checked: ids.length, added };
}

export function listInbox({ category, unhandledOnly, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (category) { params.push(category); where.push(`m.category = $${params.length}`); }
  if (unhandledOnly) where.push("m.handled = false");
  params.push(limit);
  return rows(
    `select m.id, m.from_email, m.from_name, m.subject, m.snippet, m.received_at, m.category, m.category_reason, m.handled,
            m.company_id, m.outreach_id, c.name as company_name
     from inbox_messages m left join companies c on c.id = m.company_id
     ${where.length ? `where ${where.join(" and ")}` : ""} order by m.received_at desc limit $${params.length}`,
    params,
  );
}

export function getInboxMessage(id) {
  return one(
    `select m.*, c.name as company_name, o.subject as sent_subject, o.body as sent_body
     from inbox_messages m left join companies c on c.id = m.company_id left join outreach o on o.id = m.outreach_id where m.id = $1`,
    [id],
  );
}

export async function inboxLastSync() {
  return (await getRaw("inbox_sync")) || null;
}

export { emailDomain };
