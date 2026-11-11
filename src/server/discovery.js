// src/server/discovery.js
import { one, query } from "./db.js";
import { getSecret } from "./settings.js";
import { groundedSearch, parseJsonLoose } from "./ai/index.js";
import { safeFetch } from "./safe-fetch.js";
import { companyKey, hostFromUrl, normalizeWebsite } from "./util.js";
import { htmlToText } from "./research.js";

const SENIOR = /\b(senior|sr\.?|staff|principal|lead|head of|director|vp|manager|architect|distinguished)\b/i;
const SKIP_HOSTS = /(linkedin|glassdoor|indeed|crunchbase|facebook|twitter|x\.com|instagram|wikipedia|remotive|arbeitnow|youtube|reddit|zoominfo|builtin|ycombinator|angel\.co|wellfound|g2\.com|trustpilot)/i;

// Politeness: job-board APIs are cached so repeated runs never hammer them (Remotive asks for this).
async function cachedJson(key, ttlMs, fetcher) {
  const row = await one("select body, fetched_at from http_cache where key = $1", [key]);
  if (row && Date.now() - new Date(row.fetched_at).getTime() < ttlMs) return row.body;
  const body = await fetcher();
  await query(
    `insert into http_cache (key, body, fetched_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set body = excluded.body, fetched_at = now()`,
    [key, JSON.stringify(body)],
  );
  return body;
}

async function getJson(url) {
  const res = await safeFetch(url, { timeoutMs: 20_000, maxBytes: 8_000_000, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered HTTP ${res.status}`);
  return JSON.parse(res.body.toString("utf8"));
}

const SEARCH_WORDS = { frontend: "frontend", backend: "backend", "full-stack": "full stack", fullstack: "full stack", software: "software engineer" };

export function searchTerms(titles) {
  const terms = new Set();
  for (const t of titles) {
    const lower = t.toLowerCase();
    const hit = Object.entries(SEARCH_WORDS).find(([k]) => lower.includes(k));
    terms.add(hit ? hit[1] : lower.replace(/engineer|developer/g, "").trim() || lower);
  }
  return [...terms].slice(0, 4);
}

export function locationMatches(location, countries) {
  const s = String(location || "").toLowerCase();
  if (!s || /worldwide|anywhere|global|remote\b(?!.*(only|us|usa|uk|eu))/.test(s)) return true;
  if (!countries?.length) return !/\b(only|must be)\b/.test(s) || /worldwide|anywhere/.test(s);
  return countries.some((c) => s.includes(c.toLowerCase()));
}

function parseSalaryMax(text) {
  if (!text) return null;
  const nums = [...String(text).matchAll(/(\d[\d,.]*)\s*(k)?/gi)].map((m) => {
    const n = parseFloat(m[1].replace(/,/g, ""));
    return m[2] ? n * 1000 : n;
  }).filter((n) => n >= 1000);
  return nums.length ? Math.max(...nums) : null;
}

function jobAllowed(job, prefs) {
  if (SENIOR.test(job.title)) return false;
  const type = String(job.type || "").toLowerCase().replace(/[-_ ]/g, "");
  if (type === "parttime") return false;
  if ((type === "contract" || type === "freelance") && !prefs.contract) return false;
  if (type === "internship" && !prefs.internships) return false;
  if (prefs.avoidCompanies?.some((c) => companyKey(c) === companyKey(job.company))) return false;
  if (prefs.minSalary) {
    const max = parseSalaryMax(job.salary);
    if (max && max < prefs.minSalary) return false;
  }
  return locationMatches(job.location, prefs.countries);
}

async function remotive(term) {
  const url = `https://remotive.com/api/remote-jobs?category=software-dev&search=${encodeURIComponent(term)}&limit=100`;
  const data = await cachedJson(`remotive:${term}`, 6 * 3600_000, () => getJson(url));
  return (data.jobs || []).map((j) => ({
    company: j.company_name,
    title: j.title,
    url: j.url,
    location: j.candidate_required_location || "",
    type: j.job_type,
    salary: j.salary,
    postedAt: j.publication_date,
    tags: j.tags || [],
    snippet: htmlToText(j.description || "").slice(0, 400),
    source: "remotive",
  }));
}

async function arbeitnow() {
  const data = await cachedJson("arbeitnow:1", 3 * 3600_000, () => getJson("https://www.arbeitnow.com/api/job-board-api"));
  return (data.data || []).map((j) => ({
    company: j.company_name,
    title: j.title,
    url: j.url,
    location: j.remote ? `Remote ${j.location || ""}`.trim() : j.location || "",
    remote: Boolean(j.remote),
    type: (j.job_types || [])[0],
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
    tags: j.tags || [],
    snippet: htmlToText(j.description || "").slice(0, 400),
    source: "arbeitnow",
  }));
}

export async function discoverFromBoards(prefs, { limit = 40 } = {}) {
  const terms = searchTerms(prefs.titles?.length ? prefs.titles : ["software engineer"]);
  const failed = [];
  const jobs = [];
  for (const term of terms) {
    try {
      jobs.push(...(await remotive(term)));
    } catch (err) {
      failed.push(`Remotive (${term}): ${err.message}`);
    }
  }
  try {
    const titleRe = new RegExp(terms.map((t) => t.replace(/\s+/g, "[- ]?")).join("|"), "i");
    jobs.push(...(await arbeitnow()).filter((j) => titleRe.test(j.title) && (!prefs.remote || j.remote)));
  } catch (err) {
    failed.push(`Arbeitnow: ${err.message}`);
  }

  const byCompany = new Map();
  for (const job of jobs) {
    if (!job.company || !jobAllowed(job, prefs)) continue;
    const key = companyKey(job.company);
    if (!key) continue;
    if (!byCompany.has(key)) {
      byCompany.set(key, { name: job.company.trim(), location: job.location, remote: true, source: job.source, source_url: job.url, roles: [] });
    }
    const c = byCompany.get(key);
    if (c.roles.length < 5 && !c.roles.some((r) => r.url === job.url)) {
      c.roles.push({ title: job.title, url: job.url, location: job.location, type: job.type || null, postedAt: job.postedAt, source: job.source, snippet: job.snippet });
    }
  }
  const ranked = [...byCompany.values()].sort((a, b) => b.roles.length - a.roles.length);
  return { candidates: ranked.slice(0, limit), failed };
}

// Confirms a candidate website really belongs to the company by checking the homepage mentions its name.
export async function verifyWebsite(url, name) {
  const site = normalizeWebsite(url);
  if (!site || SKIP_HOSTS.test(hostFromUrl(site) || "")) return null;
  try {
    const res = await safeFetch(site, { timeoutMs: 8000, maxBytes: 500_000, truncate: true });
    if (!res.ok) return null;
    const text = htmlToText(res.body.toString("utf8")).toLowerCase();
    const token = companyKey(name).split(" ").find((w) => w.length >= 3) || companyKey(name);
    if (!token || !text.includes(token)) return null;
    return { website: normalizeWebsite(res.url), domain: hostFromUrl(res.url) };
  } catch {
    return null;
  }
}

async function braveKey() {
  return (await getSecret("search_key:brave")) || process.env.BRAVE_SEARCH_API_KEY || null;
}

export async function searchCapability() {
  if (await braveKey()) return "brave";
  if ((await getSecret("ai_key:gemini")) || process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

// Job boards publish company names but not their sites. Resolve through a real search engine, then
// verify the page, so a lookalike domain can never be attached to the wrong company.
export async function resolveWebsite(name) {
  const key = await braveKey();
  if (key) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`${name} official website`)}&count=8`,
        { headers: { accept: "application/json", "x-subscription-token": key }, signal: AbortSignal.timeout(15_000) },
      );
      if (res.ok) {
        const data = await res.json();
        for (const r of data.web?.results || []) {
          const host = hostFromUrl(r.url);
          if (!host || SKIP_HOSTS.test(host)) continue;
          const verified = await verifyWebsite(r.url, name);
          if (verified) return { ...verified, via: "brave" };
        }
      }
    } catch {
      /* fall through to the next resolver */
    }
  }
  try {
    const out = await groundedSearch(
      `What is the official website of the company "${name}" that hires software developers? Reply with only JSON: {"website": "https://..." or null}`,
    );
    if (out?.text) {
      const { website } = parseJsonLoose(out.text);
      if (website) {
        const verified = await verifyWebsite(website, name);
        if (verified) return { ...verified, via: "gemini-search" };
      }
    }
  } catch {
    /* unresolved */
  }
  return null;
}

// Optional extra source: web-grounded discovery for fintech / startups the job boards do not list.
export async function discoverWithSearch(prefs, { count = 8 } = {}) {
  const prompt = `Using Google Search, find ${count} real companies that currently hire ${prefs.titles.join(", ")} and fit these preferences: industries ${prefs.industries.join(", ") || "any technology"}; ${prefs.remote ? "remote-friendly; " : ""}${prefs.countries?.length ? `countries ${prefs.countries.join(", ")}; ` : "international; "}prefer startups, fintech and software companies with engineering teams. Exclude: ${(prefs.avoidCompanies || []).join(", ") || "none"}.
Return only JSON: {"companies":[{"name":"","website":"https://","what":"one sentence","location":""}]}. Only include companies you found real evidence for.`;
  const out = await groundedSearch(prompt);
  if (!out?.text) return [];
  let list;
  try {
    list = parseJsonLoose(out.text).companies || [];
  } catch {
    return [];
  }
  const verified = [];
  for (const c of list.slice(0, count)) {
    if (!c?.name || !c?.website) continue;
    const site = await verifyWebsite(c.website, c.name);
    if (!site) continue;
    verified.push({
      name: String(c.name).trim(), website: site.website, domain: site.domain,
      description: String(c.what || "").slice(0, 400), location: String(c.location || ""),
      remote: prefs.remote, source: "ai_search", source_url: site.website, roles: [],
    });
  }
  return verified;
}
