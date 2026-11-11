// tests/pipeline.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, mockFetch } from "./helpers.mjs";

const research = await import("../src/server/research.js");
const sf = await import("../src/server/safe-fetch.js");
const companies = await import("../src/server/companies.js");
const discovery = await import("../src/server/discovery.js");
const { query, one } = await import("../src/server/db.js");
const { addSuppression } = await import("../src/server/outreach.js");

const mx = (ok) => {
  research.resolver.mx = async () => { if (!ok) throw new Error("ENODATA"); return [{ exchange: "mx.x", priority: 1 }]; };
  research.resolver.a = async () => { if (!ok) throw new Error("ENODATA"); return ["1.2.3.4"]; };
};

test("contact verification rules", async () => {
  mx(true);
  const v = (email, pagePath = "/") => research.verifyContact({ email, companyDomain: "acme.com", pageUrl: "https://acme.com" + pagePath, pagePath });
  assert.equal((await v("careers@acme.com")).verification, "verified");
  assert.equal((await v("Jobs@Acme.com")).verification, "verified");
  assert.equal((await v("jane@acme.com", "/careers")).verification, "verified", "published on the careers page");
  assert.equal((await v("hello@acme.com", "/contact")).verification, "unverified", "generic inbox is not a hiring contact");
  const off = await v("careers@gmail.com", "/careers");
  assert.equal(off.verification, "unverified", "not on the company's own domain");
  assert.equal((await v("not-an-email")).verification, "invalid");
  mx(false);
  assert.equal((await v("careers@acme.com")).verification, "invalid", "domain cannot receive mail");
});

test("email extraction ignores junk and handles obfuscation", () => {
  const html = `<a href="mailto:Careers@Acme.com?subject=Hi">x</a> jobs[at]acme.com noreply@acme.com privacy@acme.com <img src="logo@2x.png"> hr@sentry.wixpress.com`;
  const found = research.extractEmails(html);
  assert.deepEqual(found.sort(), ["careers@acme.com", "jobs@acme.com"]);
});

test("only the company's own addresses become contacts; third-party addresses are ignored", async () => {
  mx(true);
  const pages = [
    { path: "/careers", url: "https://acme.com/careers", emails: ["careers@acme.com", "recruiter@staffing-agency.com", "dev@acme.com"] },
    { path: "/contact", url: "https://acme.com/contact", emails: ["hello@acme.com", "ceo@acme.com"] },
  ];
  const out = await research.findContacts(pages, "acme.com");
  const emails = out.map((c) => c.email).sort();
  assert.ok(!emails.includes("recruiter@staffing-agency.com"));
  assert.ok(!emails.includes("ceo@acme.com"), "personal addresses off a contact page are not guessed at");
  assert.deepEqual(emails, ["careers@acme.com", "dev@acme.com", "hello@acme.com"]);
  assert.equal(out[0].verification, "verified");
});

test("duplicate companies are detected by name variant and by website", async () => {
  await freshDb();
  const a = await companies.upsertCompany({ name: "Acme, Inc.", website: "https://www.acme.com", roles: [{ title: "Dev", url: "https://j/1" }] });
  assert.equal(a.created, true);
  const b = await companies.upsertCompany({ name: "ACME Ltd", roles: [{ title: "Dev II", url: "https://j/2" }] });
  assert.equal(b.created, false);
  assert.equal(b.company.id, a.company.id);
  assert.equal(b.company.roles.length, 2, "roles merge");
  const c = await companies.upsertCompany({ name: "Totally Different Name", website: "https://acme.com/about" });
  assert.equal(c.created, false, "same domain, different name");
  assert.equal((await one("select count(*) as n from companies")).n, 1);
});

test("a company on the suppression list starts as Do Not Contact", async () => {
  await freshDb();
  await addSuppression("domain", "blocked.com", "asked");
  const { company } = await companies.upsertCompany({ name: "Blocked Co", website: "https://blocked.com" });
  assert.equal(company.status, "do_not_contact");
});

test("Do Not Contact cancels waiting emails", async () => {
  await freshDb();
  const { company } = await companies.upsertCompany({ name: "Acme", website: "https://acme.com" });
  await query("insert into outreach (company_id, kind, to_email, subject, body, status) values ($1,'outreach','a@acme.com','s','b','pending_approval'), ($1,'outreach','b@acme.com','s','b','approved'), ($1,'outreach','c@acme.com','s','b','sent')", [company.id]);
  await companies.setCompanyStatus(company.id, "do_not_contact");
  const rows = (await query("select to_email, status from outreach order by to_email")).rows;
  assert.deepEqual(rows.map((r) => r.status), ["rejected", "rejected", "sent"]);
});

test("drafting refuses thin research, missing/unverified contacts and duplicates", async () => {
  await freshDb();
  const { company } = await companies.upsertCompany({ name: "Acme", website: "https://acme.com" });
  assert.equal((await companies.draftOutreachFor(company.id)).reason, "research_too_thin");
  await query("update companies set research_quality = 80 where id = $1", [company.id]);
  assert.equal((await companies.draftOutreachFor(company.id)).reason, "no_verified_contact");
  await query("insert into contacts (company_id, email, email_key, verification) values ($1,'hello@acme.com','hello@acme.com','unverified')", [company.id]);
  assert.equal((await companies.draftOutreachFor(company.id)).reason, "no_verified_contact", "unverified needs explicit permission");
  assert.equal((await companies.pickContact(company.id, { allowUnverified: true })).email, "hello@acme.com");
  await addSuppression("email", "hello@acme.com", "x");
  assert.equal(await companies.pickContact(company.id, { allowUnverified: true }), null, "suppressed contacts are skipped");
});

test("job-board discovery filters seniority, part-time, contracts, avoided companies and restricted locations", async () => {
  await freshDb();
  sf.resolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const job = (o) => ({ company_name: "Valid Co", title: "Full Stack Developer", url: `https://r/${Math.random()}`, candidate_required_location: "Worldwide", job_type: "full_time", salary: "", publication_date: "2026-11-01", tags: [], description: "<p>Build things</p>", ...o });
  const m = mockFetch([
    ["remotive.com", { jobs: [
      job({}),
      job({ company_name: "Senior Co", title: "Senior Full Stack Developer" }),
      job({ company_name: "Part Co", job_type: "part_time" }),
      job({ company_name: "Contract Co", job_type: "contract" }),
      job({ company_name: "Avoid Me Inc.", title: "Full Stack Developer" }),
      job({ company_name: "Us Only Co", candidate_required_location: "USA Only" }),
      job({ company_name: "Low Pay Co", salary: "$20,000 - $30,000" }),
      job({ company_name: "Valid Co", title: "Full Stack Engineer II" }),
    ] }],
    ["arbeitnow.com", { data: [] }],
  ]);
  const prefs = { titles: ["Full-Stack Engineer"], remote: true, contract: false, internships: true, countries: [], avoidCompanies: ["Avoid Me"], minSalary: 50000 };
  const { candidates, failed } = await discovery.discoverFromBoards(prefs, { limit: 10 });
  assert.deepEqual(failed, []);
  assert.deepEqual(candidates.map((c) => c.name), ["Valid Co"]);
  assert.equal(candidates[0].roles.length, 2, "roles grouped per company");
  const before = m.calls.length;
  await discovery.discoverFromBoards(prefs, { limit: 10 });
  assert.equal(m.calls.length, before, "second run is served from the cache, not the job board");
  m.restore();
});

test("a failing job board is reported, not hidden", async () => {
  await freshDb();
  sf.resolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const m = mockFetch([["remotive.com", { status: 503, body: {} }], ["arbeitnow.com", { data: [] }]]);
  const { candidates, failed } = await discovery.discoverFromBoards({ titles: ["Backend Engineer"], remote: true, countries: [], avoidCompanies: [] });
  assert.equal(candidates.length, 0);
  assert.match(failed[0], /Remotive.*503/);
  m.restore();
});
