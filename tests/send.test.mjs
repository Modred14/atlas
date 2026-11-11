// tests/send.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectGmail, freshDb, gmailSendOk, metadataOk, mockFetch } from "./helpers.mjs";

const outreach = await import("../src/server/outreach.js");
const { one, query } = await import("../src/server/db.js");
const { getRaw, setSetting } = await import("../src/server/settings.js");
const { saveDocument } = await import("../src/server/documents.js");
const { hourInTz } = await import("../src/server/util.js");

async function setup(extra = []) {
  await freshDb();
  await connectGmail();
  const counter = { n: 0 };
  const m = mockFetch([["/messages/send", gmailSendOk(counter)], ["format=metadata", metadataOk], ...extra]);
  return { counter, m };
}

const studio = (to = "someone@example.com", over = {}) =>
  outreach.createOutreach({ kind: "studio", toEmail: to, subject: "Hello there", body: "Body text here", status: "draft", ...over });

test("manual send is refused unless the confirmed hash matches what was shown", async () => {
  const { counter, m } = await setup();
  const row = await studio();
  await assert.rejects(outreach.sendOutreach(row.id, { manual: true }), /changed after it was shown/);
  await assert.rejects(outreach.sendOutreach(row.id, { manual: true, confirmedHash: "0".repeat(64) }), /changed after it was shown/);
  assert.equal(counter.n, 0, "nothing may be sent without confirmation");

  const res = await outreach.sendOutreach(row.id, { manual: true, confirmedHash: outreach.contentHash(row) });
  assert.equal(res.ok, true);
  assert.equal(counter.n, 1);
  const saved = await one("select * from outreach where id = $1", [row.id]);
  assert.equal(saved.status, "sent");
  assert.equal(saved.gmail_message_id, "msg1");
  assert.equal(saved.rfc_message_id, "<abc@mail.gmail.com>");
  assert.match(counter.lastRaw, /Subject: Hello there/);
  assert.match(counter.lastRaw, /To: someone@example\.com/);
  m.restore();
});

test("editing after the confirmation dialog invalidates the old hash", async () => {
  const { counter, m } = await setup();
  const row = await studio();
  const shown = outreach.contentHash(row);
  await outreach.editOutreach(row.id, { body: "A different body" });
  await assert.rejects(outreach.sendOutreach(row.id, { manual: true, confirmedHash: shown }), /changed after it was shown/);
  assert.equal(counter.n, 0);
  m.restore();
});

test("a sent email cannot be sent twice", async () => {
  const { counter, m } = await setup();
  const row = await studio();
  const hash = outreach.contentHash(row);
  await outreach.sendOutreach(row.id, { manual: true, confirmedHash: hash });
  await assert.rejects(outreach.sendOutreach(row.id, { manual: true, confirmedHash: hash }), /cannot be sent/);
  assert.equal(counter.n, 1);
  m.restore();
});

test("suppressed emails and domains are never sent to", async () => {
  const { counter, m } = await setup();
  await outreach.addSuppression("email", "No@Example.com", "opt-out");
  await outreach.addSuppression("domain", "blocked.org", "asked");
  for (const to of ["no@example.com", "anyone@blocked.org", "x@sub.blocked.org"]) {
    const row = await studio(to);
    const attempt = outreach.sendOutreach(row.id, { manual: true, confirmedHash: outreach.contentHash(row) });
    if (to.endsWith("sub.blocked.org")) {
      // subdomains are not covered by a domain entry; documents the exact-match behaviour
      assert.equal((await attempt).ok, true);
    } else {
      await assert.rejects(attempt, /suppression list/);
    }
  }
  assert.equal(counter.n, 1);
  m.restore();
});

test("queue emails need approval of the exact content; edits void approval", async () => {
  const { counter, m } = await setup();
  const row = await outreach.createOutreach({ kind: "outreach", toEmail: "hr@acme.com", subject: "Engineering at Acme", body: "Body", status: "pending_approval" });
  await assert.rejects(outreach.sendOutreach(row.id), /"pending_approval"/);

  assert.deepEqual((await outreach.approveOutreach([row.id])).approved, 1);
  const edited = await outreach.editOutreach(row.id, { body: "Body, revised" });
  assert.equal(edited.status, "pending_approval", "editing sends it back to approval");
  assert.equal(edited.approved_at, null);
  await assert.rejects(outreach.sendOutreach(row.id), /"pending_approval"/);
  assert.equal(counter.n, 0);

  await outreach.approveOutreach([row.id]);
  assert.equal((await outreach.sendOutreach(row.id)).ok, true);
  assert.equal(counter.n, 1);
  assert.match(counter.lastRaw, /List-Unsubscribe/i, "outreach carries an unsubscribe header");
  m.restore();
});

test("a tampered approved row (content changed behind the app's back) is not sent", async () => {
  const { counter, m } = await setup();
  const row = await outreach.createOutreach({ kind: "outreach", toEmail: "hr@acme.com", subject: "S", body: "Original", status: "pending_approval" });
  await outreach.approveOutreach([row.id]);
  await query("update outreach set body = 'Sneaky change' where id = $1", [row.id]);
  await assert.rejects(outreach.sendOutreach(row.id), /changed after approval/);
  assert.equal(counter.n, 0);
  m.restore();
});

test("duplicate outreach to the same address within 90 days is blocked", async () => {
  const { counter, m } = await setup();
  const first = await outreach.createOutreach({ kind: "outreach", toEmail: "jobs@acme.com", subject: "One", body: "B", status: "pending_approval" });
  await outreach.approveOutreach([first.id]);
  await outreach.sendOutreach(first.id);
  const second = await outreach.createOutreach({ kind: "outreach", toEmail: "JOBS@acme.com", subject: "Two", body: "B", status: "pending_approval" });
  await outreach.approveOutreach([second.id]);
  await assert.rejects(outreach.sendOutreach(second.id), /already sent in the last 90 days/);
  assert.equal(counter.n, 1);
  m.restore();
});

test("Gmail quota errors pause sending instead of retrying or failing the email", async () => {
  await freshDb();
  await connectGmail();
  const m = mockFetch([["/messages/send", { status: 429, body: { error: { message: "Daily limit", errors: [{ reason: "rateLimitExceeded" }] } } }]]);
  const row = await outreach.createOutreach({ kind: "outreach", toEmail: "a@acme.com", subject: "S", body: "B", status: "pending_approval" });
  await outreach.approveOutreach([row.id]);
  const res = await outreach.sendOutreach(row.id);
  assert.equal(res.ok, false);
  assert.equal(res.quota, true);
  assert.equal((await one("select status from outreach where id = $1", [row.id])).status, "approved", "stays queued");
  assert.ok(await getRaw("send_pause"), "pause recorded");
  assert.match((await outreach.canSendNow({ target: 20 })).reason, /Paused/);
  const other = await outreach.createOutreach({ kind: "outreach", toEmail: "b@acme.com", subject: "S", body: "B", status: "pending_approval" });
  await outreach.approveOutreach([other.id]);
  await assert.rejects(outreach.sendOutreach(other.id), /paused/i);
  m.restore();
});

test("an expired Google authorisation marks Gmail for reconnection and keeps the draft", async () => {
  await freshDb();
  await connectGmail();
  await query("update gmail_account set access_expires_at = now() - interval '1 hour'");
  const m = mockFetch([["oauth2.googleapis.com/token", { status: 400, body: { error: "invalid_grant", error_description: "revoked" } }]]);
  const row = await studio();
  const res = await outreach.sendOutreach(row.id, { manual: true, confirmedHash: outreach.contentHash(row) });
  assert.equal(res.ok, false);
  assert.equal(res.reauth, true);
  assert.equal((await one("select status from gmail_account")).status, "reauth_required");
  assert.equal((await one("select status from outreach where id = $1", [row.id])).status, "draft");
  m.restore();
});

test("the daily hard cap stops further sends", async () => {
  const { counter, m } = await setup();
  await setSetting("safety", { dailyHardCap: 1 });
  const a = await studio("a@example.com");
  await outreach.sendOutreach(a.id, { manual: true, confirmedHash: outreach.contentHash(a) });
  const b = await studio("b@example.com");
  await assert.rejects(outreach.sendOutreach(b.id, { manual: true, confirmedHash: outreach.contentHash(b) }), /Daily cap/);
  assert.equal(counter.n, 1);
  m.restore();
});

test("canSendNow enforces the sending window and spacing between sends", async () => {
  const { m } = await setup();
  const h = hourInTz(new Date(), "UTC");
  const outside = (h + 2) % 24;
  await setSetting("safety", { sendWindow: { startHour: outside, endHour: outside === 23 ? 24 : outside + 1, timezone: "UTC" } });
  assert.match((await outreach.canSendNow({ target: 20 })).reason, /sending window/);

  await setSetting("safety", { sendWindow: { startHour: h, endHour: h === 23 ? 24 : h + 1, timezone: "UTC" } });
  assert.equal((await outreach.canSendNow({ target: 20 })).ok, true);
  const row = await studio();
  await outreach.sendOutreach(row.id, { manual: true, confirmedHash: outreach.contentHash(row) });
  assert.match((await outreach.canSendNow({ target: 20 })).reason, /Waiting between sends/);
  m.restore();
});

test("warm-up ramps the daily limit and never exceeds the cap", () => {
  const safety = { dailyHardCap: 100, warmup: true };
  assert.equal(outreach.effectiveDailyLimit({ target: 20, safety, firstSent: null }), 10);
  assert.equal(outreach.effectiveDailyLimit({ target: 20, safety, firstSent: new Date(Date.now() - 2 * 86_400_000) }), 20);
  assert.equal(outreach.effectiveDailyLimit({ target: 100, safety: { ...safety, warmup: false }, firstSent: null }), 100);
  assert.equal(outreach.effectiveDailyLimit({ target: 100, safety: { dailyHardCap: 40, warmup: false }, firstSent: null }), 40);
});

test("CV attachment: attached when available, clear failure when there is none", async () => {
  const { counter, m } = await setup();
  const noCv = await studio("a@example.com", { attachCv: true });
  const failed = await outreach.sendOutreach(noCv.id, { manual: true, confirmedHash: outreach.contentHash(noCv) });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /no CV is available/i);
  assert.equal(counter.n, 0, "an email that promised a CV is never sent without it");

  await saveDocument({ kind: "cv", filename: "Favour_CV.pdf", mime: "application/pdf", buffer: Buffer.from("%PDF-1.4 test cv"), source: "upload", makeDefault: true });
  const withCv = await studio("b@example.com", { attachCv: true });
  const ok = await outreach.sendOutreach(withCv.id, { manual: true, confirmedHash: outreach.contentHash(withCv) });
  assert.equal(ok.ok, true);
  assert.match(counter.lastRaw, /filename="?Favour_CV\.pdf/);
  assert.match(counter.lastRaw, /application\/pdf/);
  m.restore();
});

test("approving skips suppressed recipients", async () => {
  const { m } = await setup();
  await outreach.addSuppression("email", "stop@acme.com", "opt-out");
  const row = await outreach.createOutreach({ kind: "outreach", toEmail: "stop@acme.com", subject: "S", body: "B", status: "pending_approval" });
  const out = await outreach.approveOutreach([row.id]);
  assert.equal(out.approved, 0);
  assert.match(out.skipped[0].reason, /suppression/);
  m.restore();
});
