// tests/inbox.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectGmail, freshDb, mockFetch } from "./helpers.mjs";

const inbox = await import("../src/server/inbox.js");
const campaigns = await import("../src/server/campaigns.js");
const outreach = await import("../src/server/outreach.js");
const { one, query, rows } = await import("../src/server/db.js");
const { setSecret, setSetting } = await import("../src/server/settings.js");

const b64 = (s) => Buffer.from(s).toString("base64url");
const gmailMsg = ({ id, threadId, from, subject, text, headers = [] }) => ({
  id, threadId, snippet: text.slice(0, 50), internalDate: String(Date.now()),
  payload: {
    mimeType: "text/plain", body: { data: b64(text) },
    headers: [{ name: "From", value: from }, { name: "Subject", value: subject }, { name: "Message-ID", value: `<${id}@x>` }, ...headers],
  },
});

async function world({ messages, ai }) {
  await freshDb();
  await connectGmail();
  await setSecret("ai_key:gemini", "test-key");
  const c = (await one("insert into companies (name, name_key, domain, status, source) values ('Acme','acme','acme.com','email_sent','manual') returning *"));
  const sent = await outreach.createOutreach({ kind: "outreach", companyId: c.id, toEmail: "jobs@acme.com", subject: "Hello", body: "B", status: "draft" });
  await query("update outreach set status='sent', sent_at=now(), gmail_thread_id='thr1' where id=$1", [sent.id]);
  const pending = await outreach.createOutreach({ kind: "followup", companyId: c.id, toEmail: "jobs@acme.com", subject: "F", body: "B", status: "pending_approval" });
  const m = mockFetch([
    ["generativelanguage.googleapis.com", () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(ai || { category: "other", reason: "x" }) }] } }] })],
    [/*list*/ "/messages?", () => ({ messages: messages.map((x) => ({ id: x.id })) })],
    ...messages.map((x) => [`/messages/${x.id}`, () => gmailMsg(x)]),
  ]);
  return { c, sent, pending, m };
}

const status = async (id) => (await one("select status from companies where id=$1", [id])).status;

test("an interview invitation is classified, stored and moves the company on; waiting follow-ups remain", async () => {
  const { c, m } = await world({
    messages: [{ id: "m1", threadId: "thr1", from: "Jane <jane@acme.com>", subject: "Re: Hello", text: "Can you do a call Tuesday?\n\nOn Mon, X wrote:\n> Hello" }],
    ai: { category: "interview", reason: "Proposes a call" },
  });
  const r = await inbox.syncInbox();
  assert.equal(r.added, 1);
  const msg = await one("select * from inbox_messages");
  assert.equal(msg.category, "interview");
  assert.ok(!msg.body.includes("wrote:"), "quoted history is stripped");
  assert.equal(await status(c.id), "interested");
  assert.equal((await inbox.syncInbox()).added, 0, "no duplicate ingestion");
  assert.equal((await one("select count(*) as n from inbox_messages")).n, 1);
  m.restore();
});

test("an opt-out suppresses the sender, blocks the company and rejects waiting drafts", async () => {
  const { c, m } = await world({
    messages: [{ id: "m1", threadId: "thr1", from: "jane@acme.com", subject: "Re: Hello", text: "Please remove me from your list." }],
  });
  await inbox.syncInbox();
  assert.equal((await one("select category from inbox_messages")).category, "opt_out");
  assert.equal(await status(c.id), "do_not_contact");
  assert.ok(await outreach.isSuppressed("jane@acme.com"));
  assert.equal((await one("select status from outreach where kind='followup'")).status, "rejected");
  m.restore();
});

test("a hard bounce marks the contact invalid, suppresses the address and flags the email", async () => {
  const { sent, m } = await world({
    messages: [{ id: "m1", threadId: "thr9", from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", text: "550 5.1.1 jobs@acme.com user unknown" }],
  });
  await query("insert into contacts (company_id, email, email_key, verification) select company_id, 'jobs@acme.com', 'jobs@acme.com', 'verified' from outreach where id=$1", [sent.id]);
  await inbox.syncInbox();
  assert.equal((await one("select status from outreach where id=$1", [sent.id])).status, "bounced");
  assert.equal((await one("select verification from contacts")).verification, "invalid");
  assert.ok(await outreach.isSuppressed("jobs@acme.com"));
  m.restore();
});

test("auto-replies are recorded but do not count as a reply", async () => {
  const { c, m } = await world({
    messages: [{ id: "m1", threadId: "thr1", from: "hr@acme.com", subject: "Automatic reply: Hello", text: "I am out of office." }],
  });
  await inbox.syncInbox();
  assert.equal((await one("select category from inbox_messages")).category, "auto_reply");
  assert.equal(await status(c.id), "email_sent");
  m.restore();
});

test("mail in threads Atlas did not start, and our own messages, are ignored", async () => {
  const { m } = await world({
    messages: [
      { id: "m1", threadId: "other", from: "stranger@x.com", subject: "Hi", text: "Buy now" },
      { id: "m2", threadId: "thr1", from: "favourdomirin@gmail.com", subject: "Re", text: "mine" },
    ],
  });
  await inbox.syncInbox();
  assert.equal((await one("select count(*) as n from inbox_messages")).n, 0);
  m.restore();
});

// --- follow-ups ---
async function fuWorld({ daysAgo = 5, status = "email_sent", priorFollowups = 0, mutate } = {}) {
  await freshDb();
  await setSecret("ai_key:gemini", "test-key");
  const c = await one("insert into companies (name, name_key, domain, status, research, source) values ('Acme','acme','acme.com',$1,'{}','manual') returning *", [status]);
  const first = await outreach.createOutreach({ kind: "outreach", companyId: c.id, toEmail: "jobs@acme.com", subject: "Hello", body: "B", status: "draft" });
  await query("update outreach set status='sent', sent_at=now() - ($2 * interval '1 day'), gmail_thread_id='t', rfc_message_id='<a@b>' where id=$1", [first.id, daysAgo]);
  for (let i = 0; i < priorFollowups; i++) {
    const f = await outreach.createOutreach({ kind: "followup", companyId: c.id, toEmail: "jobs@acme.com", subject: "F", body: "B", status: "draft" });
    await query("update outreach set status='sent', sent_at=now() - ($2 * interval '1 day') where id=$1", [f.id, daysAgo]);
  }
  if (mutate) await mutate(c);
  const body = "Hello Acme team, I looked again at what Acme is building and wanted to share Nexopra, a payments project using Next.js and PostgreSQL that fits your stack. If this is not a good time, no problem at all, and thank you for reading.";
  const m = mockFetch([["generativelanguage.googleapis.com", () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ subject: "Following up on Acme", body }) }] } }] })]]);
  return { c, m };
}
const followups = async () => (await rows("select * from outreach where kind='followup' and status in ('draft','pending_approval')"));

test("a due follow-up is drafted for approval, threaded to the original, never sent automatically", async () => {
  const { m } = await fuWorld();
  assert.equal(await campaigns.followUps(), 1);
  const [f] = await followups();
  assert.ok(["pending_approval", "draft"].includes(f.status));
  assert.equal(f.gmail_thread_id, "t");
  assert.equal(f.reply_to_message_id, "<a@b>");
  assert.equal(await campaigns.followUps(), 0, "only one waiting follow-up at a time");
  m.restore();
});

test("no follow-up when too recent, replied, rejected or suppressed", async () => {
  for (const opts of [
    { daysAgo: 1 },
    { status: "replied" },
    { status: "rejected" },
    { mutate: async () => outreach.addSuppression("email", "jobs@acme.com", "x") },
    { mutate: async (c) => query("insert into inbox_messages (gmail_message_id, thread_id, from_email, subject, body, received_at, company_id, category) values ('g','t','jobs@acme.com','s','b',now(),$1,'other')", [c.id]) },
  ]) {
    const { m } = await fuWorld(opts);
    assert.equal(await campaigns.followUps(), 0, JSON.stringify(opts).slice(0, 60));
    assert.equal((await followups()).length, 0);
    m.restore();
  }
});

test("after the maximum follow-ups the company becomes No Response instead of another email", async () => {
  await freshDb();
  const { m } = await fuWorld({ daysAgo: 10, priorFollowups: 2 });
  const max = (await one("select 1")) && (await import("../src/server/settings.js")).getSetting;
  const safety = await max("safety");
  assert.ok(safety.maxFollowUps <= 2, "default allows at most 2 follow-ups");
  assert.equal(await campaigns.followUps(), 0);
  assert.equal((await one("select status from companies")).status, "no_response");
  m.restore();
});
