// src/server/companies.js
import { one, query, rows, tx } from "./db.js";
import { getSetting } from "./settings.js";
import { getProfile } from "./profile.js";
import { buildExcerpt, fetchSite, findContacts, qualityScore, summarize } from "./research.js";
import { resolveWebsite } from "./discovery.js";
import { writeOutreach } from "./ai/writer.js";
import { createOutreach, isSuppressed } from "./outreach.js";
import { companyKey, csvCell, hostFromUrl, normalizeEmail, normalizeWebsite } from "./util.js";
import { logEvent } from "./log.js";

export const STATUSES = [
  "discovered", "researched", "ready_for_outreach", "email_sent", "replied",
  "interested", "rejected", "no_response", "do_not_contact",
];

export async function upsertCompany(c) {
  const key = companyKey(c.name);
  if (!key) return { company: null, created: false };
  const website = c.website ? normalizeWebsite(c.website) : null;
  const domain = c.domain || (website ? hostFromUrl(website) : null);
  const existing =
    (await one("select * from companies where name_key = $1", [key])) ||
    (domain ? await one("select * from companies where domain = $1", [domain]) : null);
  if (existing) {
    const roles = [...(existing.roles || [])];
    for (const r of c.roles || []) if (!roles.some((x) => x.url === r.url)) roles.push(r);
    const updated = await one(
      `update companies set website = coalesce(website, $2), domain = coalesce(domain, $3), location = coalesce(location, $4),
         description = coalesce(description, $5), industry = coalesce(industry, $6), roles = $7::jsonb, updated_at = now()
       where id = $1 returning *`,
      [existing.id, website, domain, c.location || null, c.description || null, c.industry || null, JSON.stringify(roles.slice(0, 8))],
    );
    return { company: updated, created: false };
  }
  const blocked = domain && (await isSuppressed(`x@${domain}`));
  const created = await one(
    `insert into companies (name, name_key, website, domain, industry, location, description, remote, source, source_url, roles, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) returning *`,
    [
      c.name.trim(), key, website, domain, c.industry || null, c.location || null, c.description || null,
      c.remote ?? null, c.source || "manual", c.source_url || null, JSON.stringify((c.roles || []).slice(0, 8)),
      blocked ? "do_not_contact" : "discovered",
    ],
  );
  return { company: created, created: true };
}

export async function setCompanyStatus(id, status) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error("Unknown status"), { status: 400 });
  await query("update companies set status = $2, updated_at = now() where id = $1", [id, status]);
  if (status === "do_not_contact") {
    // Cancels anything waiting to go out to this company.
    await query(
      "update outreach set status='rejected', error='Company marked Do Not Contact', updated_at=now() where company_id=$1 and status in ('draft','pending_approval','approved')",
      [id],
    );
  }
}

export async function listCompanies({ search, status, verified, sort = "discovered_at", dir = "desc", limit = 200, offset = 0 } = {}) {
  const cols = { discovered_at: "c.discovered_at", name: "c.name", last_contacted_at: "c.last_contacted_at", status: "c.status", industry: "c.industry" };
  const where = [];
  const params = [];
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(lower(c.name) like $${params.length} or lower(coalesce(c.industry,'')) like $${params.length} or lower(coalesce(c.location,'')) like $${params.length} or lower(coalesce(c.domain,'')) like $${params.length})`);
  }
  if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
  if (verified === "verified") where.push("exists (select 1 from contacts k where k.company_id = c.id and k.verification = 'verified')");
  if (verified === "unverified") where.push("not exists (select 1 from contacts k where k.company_id = c.id and k.verification = 'verified')");
  params.push(Math.min(limit, 1000), offset);
  return rows(
    `select c.*,
       (select count(*) from contacts k where k.company_id = c.id) as contact_count,
       (select k.email from contacts k where k.company_id = c.id and k.verification <> 'invalid'
          order by (k.verification = 'verified') desc, k.id limit 1) as best_email,
       (select k.verification from contacts k where k.company_id = c.id and k.verification <> 'invalid'
          order by (k.verification = 'verified') desc, k.id limit 1) as best_verification
     from companies c ${where.length ? `where ${where.join(" and ")}` : ""}
     order by ${cols[sort] || cols.discovered_at} ${dir === "asc" ? "asc" : "desc"} nulls last, c.id desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}

export async function getCompany(id) {
  const company = await one("select * from companies where id = $1", [id]);
  if (!company) return null;
  const contacts = await rows("select * from contacts where company_id = $1 order by (verification = 'verified') desc, id", [id]);
  const history = await rows(
    "select id, kind, status, subject, sent_at, created_at from outreach where company_id = $1 order by created_at desc limit 20",
    [id],
  );
  return { ...company, contacts, history };
}

export async function addManualContact(companyId, { email, name, role }) {
  const e = normalizeEmail(email);
  const company = await one("select domain from companies where id = $1", [companyId]);
  const onDomain = company?.domain && e.endsWith(`@${company.domain}`);
  return one(
    `insert into contacts (company_id, name, role, email, email_key, verification, verification_note)
     values ($1,$2,$3,$4,$4,'unverified',$5) on conflict (email_key) do nothing returning *`,
    [companyId, name || null, role || null, e, onDomain ? "Added manually by you; not confirmed by the company." : "Added manually by you; address is not on the company's domain."],
  );
}

export async function exportCompaniesCsv() {
  const list = await listCompanies({ limit: 1000 });
  const head = ["Name", "Website", "Industry", "Location", "Description", "Contact email", "Verification", "Open roles", "Status", "Discovered", "Last contacted", "Notes"];
  const lines = [head.join(",")];
  for (const c of list) {
    lines.push(
      [
        c.name, c.website, c.industry, c.location, c.description, c.best_email, c.best_verification,
        (c.roles || []).map((r) => r.title).join("; "), c.status, c.discovered_at?.toISOString?.() ?? c.discovered_at,
        c.last_contacted_at?.toISOString?.() ?? c.last_contacted_at ?? "", c.notes,
      ].map(csvCell).join(","),
    );
  }
  return lines.join("\n");
}

// Researches one company from its own public pages. Nothing is invented: if no website can be
// confirmed, or no contact is published, that is recorded and the company simply is not emailed.
export async function researchCompany(id) {
  const company = await one("select * from companies where id = $1", [id]);
  if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });
  if (company.status === "do_not_contact") return { skipped: "do_not_contact" };

  let { website, domain } = company;
  if (!website) {
    const found = await resolveWebsite(company.name);
    if (found) {
      website = found.website;
      domain = found.domain;
      const clash = await one("select id from companies where domain = $1 and id <> $2", [domain, id]);
      if (clash) {
        await query("update companies set notes = coalesce(notes || E'\\n', '') || $2, updated_at = now() where id = $1", [id, `Website ${domain} already belongs to another company record.`]);
        website = null;
        domain = null;
      } else {
        await query("update companies set website=$2, domain=$3, updated_at=now() where id=$1", [id, website, domain]);
      }
    }
  }
  if (!website) {
    await query(
      "update companies set research = $2::jsonb, research_quality = 0, researched_at = now(), updated_at = now() where id = $1",
      [id, JSON.stringify({ note: "No official website could be confirmed, so no outreach was prepared." })],
    );
    return { ok: false, reason: "no_website" };
  }

  const site = await fetchSite(website);
  if (!site.pages.length) {
    await query(
      "update companies set research = $2::jsonb, research_quality = 0, researched_at = now(), updated_at = now() where id = $1",
      [id, JSON.stringify({ note: "The website could not be fetched (blocked, offline or disallowed by robots.txt)." })],
    );
    return { ok: false, reason: "unreachable" };
  }
  const allText = site.pages.map((p) => p.text).join("\n\n");
  const summary = await summarize(allText, company.name);
  const contacts = await findContacts(site.pages, domain);
  const quality = qualityScore({ pages: site.pages, roles: company.roles, summary });
  const research = { ...summary, excerpt: buildExcerpt(site.pages), pagesRead: site.pages.map((p) => p.url) };

  await tx(async (db) => {
    await db.query(
      `update companies set research=$2::jsonb, research_quality=$3, researched_at=now(), industry=coalesce(industry,$4),
         description=coalesce(description,$5), status = case when status='discovered' then 'researched' else status end, updated_at=now()
       where id=$1`,
      [id, JSON.stringify(research), quality, summary.industry || null, summary.whatTheyDo || null],
    );
    for (const c of contacts) {
      await db.query(
        `insert into contacts (company_id, email, email_key, verification, verification_note, source_url, mx_ok)
         values ($1,$2,$2,$3,$4,$5,$6) on conflict (email_key) do nothing`,
        [id, c.email, c.verification, c.note, c.source_url, c.mx_ok],
      );
    }
  });
  await logEvent("info", "company_researched", { id, quality, contacts: contacts.length });
  return { ok: true, quality, contacts: contacts.length };
}

// Picks the best usable contact: verified on-domain first; unverified ones only when the owner allows.
export async function pickContact(companyId, { allowUnverified }) {
  const list = await rows(
    `select * from contacts where company_id = $1 and verification <> 'invalid'
       and ($2 or verification = 'verified') order by (verification = 'verified') desc, id`,
    [companyId, allowUnverified],
  );
  for (const c of list) if (!(await isSuppressed(c.email))) return c;
  return null;
}

export async function draftOutreachFor(companyId, { campaignId = null, tone = "professional", attachCv = false, allowUnverified = false, status = "pending_approval", minQuality = 45 } = {}) {
  const company = await one("select * from companies where id = $1", [companyId]);
  if (!company || company.status === "do_not_contact") return { ok: false, reason: "not_contactable" };
  if ((company.research_quality ?? 0) < minQuality) return { ok: false, reason: "research_too_thin" };
  const contact = await pickContact(companyId, { allowUnverified });
  if (!contact) return { ok: false, reason: "no_verified_contact" };
  const dup = await one(
    `select id from outreach where lower(to_email) = $1 and kind = 'outreach'
       and status in ('pending_approval','approved','sending','sent','bounced') limit 1`,
    [contact.email],
  );
  if (dup) return { ok: false, reason: "already_contacted" };

  const profile = await getProfile();
  const out = await writeOutreach({ profile, company, contact, tone, attachCv });
  // A draft that still fails its checks after a retry is never queued for sending, only kept for editing.
  const finalStatus = out.lint.ok ? status : "draft";
  const row = await createOutreach({
    campaignId, companyId, contactId: contact.id, kind: "outreach", toEmail: contact.email, toName: contact.name,
    subject: out.subject, body: `${out.body}\n\n${profile.signature.trim()}`, attachCv, status: finalStatus,
    lint: out.lint, generation: out.generation,
  });
  await query("update companies set status = case when status in ('discovered','researched') then 'ready_for_outreach' else status end, updated_at=now() where id=$1", [companyId]);
  return { ok: true, outreach: row, lintOk: out.lint.ok };
}

export async function settingsForCampaign() {
  return { career: await getSetting("career"), safety: await getSetting("safety") };
}
