// tests/core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers.mjs";

const { encrypt, decrypt } = await import("../src/server/crypto.js");
const { createSessionToken, verifySessionToken } = await import("../src/server/session.js");
const { hashPassword, verifyPassword } = await import("../src/server/password.js");
const util = await import("../src/server/util.js");
const sf = await import("../src/server/safe-fetch.js");
const { lintEmail } = await import("../src/server/ai/writer.js");
const { DEFAULT_PROFILE } = await import("../src/server/profile.js");
const { contentHash } = await import("../src/server/outreach.js");
const { mockFetch } = await import("./helpers.mjs");

test("encryption round-trips and rejects tampering", () => {
  const ct = encrypt("sk-secret-token");
  assert.ok(!ct.includes("sk-secret-token"));
  assert.equal(decrypt(ct), "sk-secret-token");
  assert.notEqual(encrypt("x"), encrypt("x"), "fresh IV every time");
  const parts = ct.split(":");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decrypt(parts.join(":")));
});

test("session tokens verify, expire and resist tampering", async () => {
  const secret = process.env.SESSION_SECRET;
  const token = await createSessionToken(secret);
  assert.equal(await verifySessionToken(token, secret), true);
  assert.equal(await verifySessionToken(token, "x".repeat(40)), false);
  assert.equal(await verifySessionToken(token + "a", secret), false);
  assert.equal(await verifySessionToken("", secret), false);
  assert.equal(await verifySessionToken(token, ""), false);
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ exp: 9_999_999_999 })).toString("base64url");
  assert.equal(await verifySessionToken(`${forged}.${sig}`, secret), false);
  // an expired but correctly signed token
  const realNow = Date.now;
  Date.now = () => realNow() + 8 * 24 * 3600 * 1000;
  try {
    assert.equal(await verifySessionToken(token, secret), false);
  } finally {
    Date.now = realNow;
  }
  assert.ok(payload);
});

test("password hashing", () => {
  const h = hashPassword("correct horse battery");
  assert.ok(h.startsWith("scrypt:") && !h.includes("$"));
  assert.equal(verifyPassword("correct horse battery", h), true);
  assert.equal(verifyPassword("wrong", h), false);
  assert.equal(verifyPassword("x", "garbage"), false);
});

test("company keys collapse legal suffixes and punctuation", () => {
  assert.equal(util.companyKey("Acme, Inc."), util.companyKey("ACME Ltd"));
  assert.equal(util.companyKey("Stripe"), util.companyKey("stripe, inc"));
  assert.notEqual(util.companyKey("Acme"), util.companyKey("Acmetron"));
  assert.equal(util.companyKey("Café & Co"), util.companyKey("Cafe and Co"));
});

test("CSV cells neutralise spreadsheet formulas and quote correctly", () => {
  assert.equal(util.csvCell("=HYPERLINK(\"http://evil\")"), "\"'=HYPERLINK(\"\"http://evil\"\")\"");
  assert.equal(util.csvCell("+1+1"), "'+1+1");
  assert.equal(util.csvCell("a,b"), '"a,b"');
  assert.equal(util.csvCell(null), "");
});

test("email validation and domain helpers", () => {
  assert.ok(util.isValidEmail("a.b+c@sub.example.co"));
  for (const bad of ["", "a@b", "a b@c.com", "@x.com", "a@@x.com", "<a@b.com>"]) assert.equal(util.isValidEmail(bad), false, bad);
  assert.equal(util.domainMatches("x@mail.acme.com", "acme.com"), true);
  assert.equal(util.domainMatches("x@evilacme.com", "acme.com"), false);
});

test("content hash covers recipient, subject, body and attachments", () => {
  const base = { to_email: "A@B.com", subject: "S", body: "B", attach_cv: false, attachment_ids: [] };
  const h = contentHash(base);
  assert.equal(contentHash({ ...base, to_email: "a@b.com" }), h, "case-insensitive recipient");
  for (const change of [{ to_email: "c@b.com" }, { subject: "S2" }, { body: "B2" }, { attach_cv: true }, { attachment_ids: [4] }]) {
    assert.notEqual(contentHash({ ...base, ...change }), h, JSON.stringify(change));
  }
});

test("safe-fetch refuses private, loopback, metadata and odd URLs", async () => {
  for (const url of [
    "http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://10.1.2.3/",
    "http://192.168.0.9/", "http://172.20.0.1/", "http://[::ffff:127.0.0.1]/", "ftp://example.com/", "https://user:pw@example.com/",
    "https://example.com:8443/", "http://foo.internal/", "http://printer.local/",
  ]) {
    await assert.rejects(sf.assertPublicUrl(url), undefined, url);
  }
  sf.resolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  assert.ok(await sf.assertPublicUrl("https://example.com/path"));
  sf.resolver.lookup = async () => [{ address: "10.0.0.8", family: 4 }];
  await assert.rejects(sf.assertPublicUrl("https://sneaky.example.com/"), /private/i, "DNS pointing inward");
});

test("safe-fetch does not follow a redirect into a private address", async () => {
  sf.resolver.lookup = async (host) => [{ address: host === "evil.test" ? "93.184.216.34" : "127.0.0.1", family: 4 }];
  const m = mockFetch([["evil.test", () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:80/admin" } })]]);
  await assert.rejects(sf.safeFetch("https://evil.test/"), /private/i);
  assert.equal(m.calls.length, 1, "the internal address was never requested");
  m.restore();
});

test("safe-fetch caps response size", async () => {
  sf.resolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const m = mockFetch([["big.test", () => new Response("x".repeat(5000))]]);
  await assert.rejects(sf.safeFetch("https://big.test/", { maxBytes: 1000 }), /too large/);
  const cut = await sf.safeFetch("https://big.test/", { maxBytes: 1000, truncate: true });
  assert.equal(cut.body.length, 1000);
  m.restore();
});

const good = {
  subject: "Full-stack engineer interested in Acme's payments work",
  body: `Hello Acme team,

I saw that Acme builds payment tooling for small merchants, and the checkout and escrow work is close to what I have built myself. I recently shipped Nepogames, a marketplace with escrow payments, a Paystack wallet and a dispute system, using Next.js, Node.js and PostgreSQL.

I am a Software Engineering student at Obafemi Awolowo University with about three years of experience building and deploying web apps. My portfolio is at https://modred.dev and my CV is attached.

Would you be open to a short chat, or could you point me to the right person to ask about engineering openings?

Best,`,
};

test("email lint accepts a specific, honest draft", () => {
  const r = lintEmail({ ...good, kind: "outreach", profile: DEFAULT_PROFILE, companyName: "Acme", companyHost: "acme.com" });
  assert.deepEqual(r.issues, []);
});

test("email lint catches generic phrases, placeholders, inflated claims, stray links and missing company", () => {
  const profile = DEFAULT_PROFILE;
  const run = (body, extra = {}) => lintEmail({ subject: good.subject, body, kind: "outreach", profile, companyName: "Acme", ...extra }).issues.join(" | ");
  const filler = " Filler words to reach the minimum length for an outreach email so only the targeted rule fires here. ".repeat(3);
  assert.match(run("I hope this email finds you well, Acme." + filler), /generic phrase/);
  assert.match(run("I am passionate about Acme." + filler), /passionate/);
  assert.match(run("Hi [Name], Acme." + filler), /placeholder/);
  assert.match(run("I have 8 years of experience at Acme." + filler), /8 years/);
  assert.match(run("See https://totally-unrelated.example/offer for Acme." + filler), /not in the profile/);
  assert.match(run("Hello team." + filler), /not personalised/);
  assert.match(run("Short Acme note."), /too short/);
  assert.equal(run("About Acme, see https://modred.dev and https://github.com/Modred14." + filler), "");
});
