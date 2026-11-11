// src/server/campaigns.js
import { one, query, rows } from "./db.js";
import { getSetting } from "./settings.js";
import { getProfile } from "./profile.js";
import { discoverFromBoards, discoverWithSearch } from "./discovery.js";
import { draftOutreachFor, researchCompany, upsertCompany } from "./companies.js";
import { writeFollowUp } from "./ai/writer.js";
import { canSendNow, createOutreach, isSuppressed, reapStaleSending, sendOutreach } from "./outreach.js";
import { enqueue, processJobs, recoverStaleJobs } from "./jobs.js";
import { getAccount } from "./gmail.js";
import { syncInbox } from "./inbox.js";
import { cvSource, syncCv } from "./documents.js";
import { logEvent } from "./log.js";
import { merge } from "./util.js";

export const CAMPAIGN_DEFAULTS = {
  dailyTarget: 20,
  categories: ["Full-Stack Engineering", "Frontend Engineering", "Backend Engineering", "Software Engineering"],
  countries: [],
  industries: [],
  tone: "professional",
  requireApproval: true,
  attachCv: true,
  allowUnverified: false,
  followUpDays: 5,
  maxFollowUps: 1,
};

export function campaignConfig(row) {
  return merge(CAMPAIGN_DEFAULTS, row.config);
}

export function listCampaigns() {
  return rows(
    `select c.*,
       (select count(*) from outreach o where o.campaign_id = c.id) as total,
       (select count(*) from outreach o where o.campaign_id = c.id and o.status = 'pending_approval') as pending,
       (select count(*) from outreach o where o.campaign_id = c.id and o.status in ('sent','bounced')) as sent
     from campaigns c order by c.id desc`,
  );
}

export async function createCampaign({ name, config, startsOn = null, endsOn = null }) {
  return one(
    "insert into campaigns (name, config, starts_on, ends_on, status) values ($1, $2::jsonb, $3, $4, 'draft') returning *",
    [name, JSON.stringify(merge(CAMPAIGN_DEFAULTS, config)), startsOn, endsOn],
  );
}

export async function updateCampaign(id, patch) {
  const row = await one("select * from campaigns where id = $1", [id]);
  if (!row) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  const config = patch.config ? merge(campaignConfig(row), patch.config) : row.config;
  const safety = await getSetting("safety");
  // Automatic Mode is only possible after the owner has enabled it globally; it is never the default.
  if (config.requireApproval === false && !safety.autoSendEnabled) {
    throw Object.assign(new Error("Automatic Mode is off. Turn it on in Settings → Campaigns before disabling approval."), { status: 409 });
  }
  return one(
    `update campaigns set name = $2, config = $3::jsonb, starts_on = $4, ends_on = $5, status = $6, updated_at = now() where id = $1 returning *`,
    [
      id, patch.name ?? row.name, JSON.stringify(config),
      patch.startsOn !== undefined ? patch.startsOn : row.starts_on,
      patch.endsOn !== undefined ? patch.endsOn : row.ends_on,
      patch.status ?? row.status,
    ],
  );
}

function today(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

export async function activeCampaigns() {
  const safety = await getSetting("safety");
  const d = today(safety.sendWindow.timezone);
  return rows(
    "select * from campaigns where status = 'active' and (starts_on is null or starts_on <= $1) and (ends_on is null or ends_on >= $1) order by id",
    [d],
  );
}

// How many new drafts the campaign still needs today. Drafts already waiting for approval count, so
// the queue never balloons past the day's target.
async function draftsNeeded(campaign) {
  const cfg = campaignConfig(campaign);
  const safety = await getSetting("safety");
  const made = await one(
    `select count(*) as n from outreach where campaign_id = $1 and kind = 'outreach'
       and (created_at at time zone $2)::date = (now() at time zone $2)::date`,
    [campaign.id, safety.sendWindow.timezone],
  );
  return Math.max(0, Math.min(cfg.dailyTarget, safety.dailyHardCap) - made.n);
}

export async function discoverForCampaign(campaign, { want }) {
  const career = await getSetting("career");
  const cfg = campaignConfig(campaign);
  const prefs = {
    ...career,
    titles: cfg.categories.length ? cfg.categories : career.titles,
    countries: cfg.countries.length ? cfg.countries : career.countries,
    industries: cfg.industries.length ? cfg.industries : career.industries,
  };
  const found = { created: 0, failedSources: [] };
  const { candidates, failed } = await discoverFromBoards(prefs, { limit: Math.max(want * 3, 20) });
  found.failedSources.push(...failed);
  let extra = [];
  try {
    extra = await discoverWithSearch(prefs, { count: 8 });
  } catch (err) {
    found.failedSources.push(`AI search: ${err.message}`);
  }
  for (const c of [...candidates, ...extra]) {
    const { created } = await upsertCompany(c);
    if (created) found.created++;
  }
  await logEvent("info", "discovery_run", { campaign: campaign.id, ...found });
  return found;
}

// Queues research for companies that still need it, then drafts for those that are ready.
// Each step is a separate job so a slow site or an AI quota hit only affects that one company.
export async function planCampaign(campaign) {
  const cfg = campaignConfig(campaign);
  const need = await draftsNeeded(campaign);
  if (need <= 0) return { queued: 0, reason: "target reached" };

  const ready = await rows(
    `select c.id from companies c
     where c.status in ('researched','ready_for_outreach','discovered') and c.research_quality >= 45
       and not exists (select 1 from outreach o where o.company_id = c.id and o.kind = 'outreach' and o.status not in ('rejected','failed'))
       and exists (select 1 from contacts k where k.company_id = c.id and k.verification <> 'invalid' and ($2 or k.verification = 'verified'))
     order by c.research_quality desc, c.id limit $1`,
    [need, cfg.allowUnverified],
  );
  let queued = 0;
  for (const r of ready) {
    if (await enqueue("draft_outreach", { companyId: r.id, campaignId: campaign.id }, { dedupeKey: `draft:${r.id}` })) queued++;
  }
  if (queued >= need) return { queued };

  const unresearched = await rows(
    "select id from companies where status = 'discovered' and researched_at is null order by id limit $1",
    [Math.max(5, (need - queued) * 2)],
  );
  for (const r of unresearched) {
    if (await enqueue("research_company", { companyId: r.id, campaignId: campaign.id }, { dedupeKey: `research:${r.id}` })) queued++;
  }
  if (queued === 0) {
    await enqueue("discover", { campaignId: campaign.id, want: need }, { dedupeKey: `discover:${campaign.id}` });
  }
  return { queued };
}

export const handlers = {
  async discover({ campaignId, want }) {
    const c = await one("select * from campaigns where id = $1", [campaignId]);
    if (!c) return { skipped: true };
    return discoverForCampaign(c, { want: want || 20 });
  },
  async research_company({ companyId }) {
    return researchCompany(companyId);
  },
  async draft_outreach({ companyId, campaignId }) {
    const c = await one("select * from campaigns where id = $1", [campaignId]);
    if (!c || c.status !== "active") return { skipped: "campaign inactive" };
    if ((await draftsNeeded(c)) <= 0) return { skipped: "target reached" };
    const cfg = campaignConfig(c);
    const safety = await getSetting("safety");
    const result = await draftOutreachFor(companyId, {
      campaignId, tone: cfg.tone, attachCv: cfg.attachCv && safety.attachCvDefault,
      allowUnverified: cfg.allowUnverified,
      // In Automatic Mode only a clean draft is approved; anything else waits for the owner.
      status: "pending_approval",
    });
    if (result.ok && !cfg.requireApproval && safety.autoSendEnabled && result.lintOk) {
      const contact = await one("select verification from contacts where id = $1", [result.outreach.contact_id]);
      if (contact?.verification === "verified") {
        await query(
          "update outreach set status='approved', approved_at=now(), updated_at=now() where id=$1 and status='pending_approval'",
          [result.outreach.id],
        );
      }
    }
    return result;
  },
};

// Follow-ups are decided per company from its most recent sent email. Never sent when the company has
// replied (anything but an auto-reply or bounce), declined, opted out, or already has one waiting.
export async function followUps() {
  const safety = await getSetting("safety");
  const due = await rows(
    `select l.* from companies c
     join lateral (
       select o.* from outreach o
       where o.company_id = c.id and o.kind in ('outreach','followup') and o.status = 'sent'
       order by o.sent_at desc limit 1
     ) l on true
     where c.status = 'email_sent'
       and l.sent_at < now() - ($1 * interval '1 day')
       and not exists (select 1 from inbox_messages m where m.company_id = c.id and m.category not in ('bounce','auto_reply'))
       and not exists (select 1 from outreach f where f.company_id = c.id and f.kind = 'followup' and f.status in ('draft','pending_approval','approved','sending'))
     order by l.sent_at limit 5`,
    [safety.followUpDays],
  );
  let created = 0;
  for (const last of due) {
    const sent = await one("select count(*) as n from outreach where company_id = $1 and kind = 'followup' and status = 'sent'", [last.company_id]);
    if (sent.n >= safety.maxFollowUps) {
      await query("update companies set status = 'no_response', updated_at = now() where id = $1 and status = 'email_sent'", [last.company_id]);
      continue;
    }
    if (await isSuppressed(last.to_email)) continue;
    const company = await one("select * from companies where id = $1", [last.company_id]);
    if (!company || company.status === "do_not_contact") continue;
    const days = Math.floor((Date.now() - new Date(last.sent_at).getTime()) / 86_400_000);
    const profile = await getProfile();
    const first = await one("select subject, body from outreach where company_id = $1 and kind = 'outreach' and status = 'sent' order by sent_at limit 1", [last.company_id]);
    const out = await writeFollowUp({ profile, company, previous: first || last, daysSince: days });
    await createOutreach({
      campaignId: last.campaign_id, companyId: last.company_id, contactId: last.contact_id, kind: "followup",
      toEmail: last.to_email, toName: last.to_name, subject: out.subject, body: `${out.body}\n\n${profile.signature.trim()}`,
      attachCv: false, status: out.lint.ok ? "pending_approval" : "draft", lint: out.lint,
      generation: out.generation, parentId: last.id, threadId: last.gmail_thread_id, replyToMessageId: last.rfc_message_id,
    });
    created++;
  }
  return created;
}

// One scheduled tick. Safe to call often: it is single-flight and every step is rate-limited.
export async function runTick({ budgetMs = 45_000 } = {}) {
  const lock = await one(
    `insert into locks (name, locked_until) values ('tick', now() + interval '5 minutes')
     on conflict (name) do update set locked_until = excluded.locked_until where locks.locked_until < now() returning name`,
  );
  if (!lock) return { skipped: "another tick is running" };
  const report = { sent: 0, jobs: 0, notes: [] };
  const started = Date.now();
  try {
    await reapStaleSending();
    await recoverStaleJobs();

    try {
      if (await cvSource()) await syncCv();
    } catch (err) {
      report.notes.push(`CV sync: ${err.message}`);
    }

    const account = await getAccount();
    if (account?.status === "connected") {
      try {
        report.inbox = await syncInbox({ budgetMs: 15_000 });
      } catch (err) {
        report.notes.push(`Inbox sync: ${err.message}`);
      }
    }

    const campaigns = await activeCampaigns();
    for (const c of campaigns) {
      try {
        report.plan = await planCampaign(c);
      } catch (err) {
        report.notes.push(`Plan "${c.name}": ${err.message}`);
      }
    }
    if (campaigns.length) {
      try {
        report.followUps = await followUps();
      } catch (err) {
        report.notes.push(`Follow-ups: ${err.message}`);
      }
    }

    const results = await processJobs({ budgetMs: Math.max(5_000, budgetMs - (Date.now() - started) - 10_000), handlers });
    report.jobs = results.length;

    // Send at most one approved email per tick pass window; the safety gates decide whether it is allowed.
    const target = campaigns.length ? Math.max(...campaigns.map((c) => campaignConfig(c).dailyTarget)) : 20;
    while (Date.now() - started < budgetMs) {
      const gate = await canSendNow({ target });
      if (!gate.ok) { report.notes.push(gate.reason); break; }
      const next = await one(
        `select id from outreach where status = 'approved' and approved_at is not null
         order by approved_at limit 1`,
      );
      if (!next) break;
      const res = await sendOutreach(next.id).catch((err) => ({ ok: false, error: err.message }));
      if (res.ok) report.sent++;
      else { report.notes.push(res.error); if (res.quota || res.reauth) break; }
      break; // minimum interval between sends is enforced by canSendNow on the next tick
    }
  } finally {
    await query("update locks set locked_until = now() where name = 'tick'");
  }
  return report;
}
