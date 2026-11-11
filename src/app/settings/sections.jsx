// src/app/settings/sections.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, KeyRound, LogOut, Mail, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { signOut } from "../components/Sidebar";
import {
  api, Badge, Button, Card, ConfirmDialog, Empty, ErrorNote, Field, formatDateTime, Input, ListInput, Notice, Select, Textarea, Toggle, timeAgo,
  useLoad, useToast,
} from "../components/ui";

/* ----------------------------------------------------------- shared */

function Section({ title, description, children, footer }) {
  return (
    <Card className="mb-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-zinc-500">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
      {footer && <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/[0.07] pt-4">{footer}</div>}
    </Card>
  );
}

// Local draft of one settings group; saved as a whole through PUT /api/settings.
function useGroup(data, key, reload) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(data.settings[key]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings[key]);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  async function save() {
    setSaving(true); setError("");
    try {
      const out = await api("/api/settings", { method: "PUT", body: { key, value: draft } });
      setDraft(out.value);
      toast("Settings saved", "success");
      await reload();
    } catch (e) {
      setError(e.data?.issues?.[0] ? `${e.data.issues[0].path.replace(/^value\./, "")}: ${e.data.issues[0].message}` : e.message);
    } finally { setSaving(false); }
  }
  const saveBar = (
    <>
      {error && <span className="mr-auto text-sm text-red-400">{error}</span>}
      {dirty && !saving && <span className="text-xs text-zinc-500">Unsaved changes</span>}
      <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save changes</Button>
    </>
  );
  return { draft, set, setDraft, saveBar, dirty };
}

/* --------------------------------------------------------------- AI */

function KeyRow({ name, label, status, envKey, onChanged }) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const call = async (method, body, msg) => {
    setBusy(true);
    try { await api("/api/settings/secrets", { method, body }); toast(msg, "success"); setValue(""); await onChanged(); }
    catch (e) { toast(e.data?.issues?.[0]?.message || e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-zinc-300">{label}</span>
        {status.stored ? <Badge tone="green">Stored, encrypted</Badge> : status.env ? <Badge tone="blue">From server environment</Badge> : <Badge>Not set</Badge>}
      </div>
      <div className="flex gap-2">
        <Input type="password" autoComplete="off" aria-label={`${label} API key`} placeholder={status.stored ? "Paste a new key to replace it" : `Paste key${envKey ? ` (or set ${envKey})` : ""}`} value={value} onChange={(e) => setValue(e.target.value)} />
        <Button loading={busy} disabled={value.trim().length < 8} onClick={() => call("PUT", { name, value: value.trim() }, "Key saved")}>Save</Button>
        {status.stored && <Button variant="ghost" aria-label={`Remove ${label} key`} disabled={busy} onClick={() => call("DELETE", { name }, "Key removed")} icon={Trash2} />}
      </div>
    </div>
  );
}

const TONES = ["professional", "friendly", "formal", "persuasive", "casual", "concise", "confident"];

export function AiSection({ data, reload }) {
  const g = useGroup(data, "ai", reload);
  const p = g.draft.provider;
  const preset = data.providers[p];
  return (
    <>
      <Section title="Provider and model" description="Atlas writes and researches through whichever provider you choose. Switch any time; your keys are kept separately for each." footer={g.saveBar}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="AI provider">{(id) => <Select id={id} value={p} onChange={(e) => { g.set("provider", e.target.value); g.set("model", data.providers[e.target.value].defaultModel); }}>{Object.entries(data.providers).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
          <Field label="Model" hint={preset.defaultModel ? `Suggested: ${preset.defaultModel}` : "Enter the exact model name from your provider."}>{(id) => <Input id={id} value={g.draft.model} onChange={(e) => g.set("model", e.target.value)} placeholder={preset.defaultModel || "model name"} />}</Field>
        </div>
        {p === "custom" && <Field label="Base URL" hint="Any OpenAI-compatible endpoint, e.g. https://api.example.com/v1">{(id) => <Input id={id} value={g.draft.baseUrl} onChange={(e) => g.set("baseUrl", e.target.value)} placeholder="https://…/v1" />}</Field>}
        <Field label="Default email tone">{(id) => <Select id={id} value={g.draft.defaultTone} onChange={(e) => g.set("defaultTone", e.target.value)} className="capitalize">{TONES.map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
        <Field label="Personalisation instructions" hint="Standing instructions added to every email, e.g. “Keep it under 120 words. Mention I am open to relocation.” Facts about you still come only from your profile and CV.">
          {(id) => <Textarea id={id} rows={4} maxLength={2000} value={g.draft.personalization} onChange={(e) => g.set("personalization", e.target.value)} />}
        </Field>
      </Section>

      <Section title="API keys" description="Keys are encrypted before they are stored and are never sent back to the browser. A key can also be provided as a server environment variable.">
        <KeyRow name={p} label={preset.label} status={data.keys[p]} envKey={preset.envKey} onChanged={reload} />
        <p className="text-xs leading-relaxed text-zinc-600">
          Free tiers: Google Gemini (<a className="text-[rgb(125,178,255)] hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>) and Groq (<a className="text-[rgb(125,178,255)] hover:underline" href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">console.groq.com/keys</a>) offer free usage with rate limits that can change. Check their pricing pages for current limits.
        </p>
      </Section>

      <Section title="Website lookup" description="Job boards list company names but not websites. A search source lets Atlas find and confirm each company's real site. Gemini (with Google Search) works if you already have a Gemini key; Brave Search is an alternative.">
        {!data.keys.gemini.stored && !data.keys.gemini.env && p !== "gemini" && <KeyRow name="gemini" label="Google Gemini (for web search)" status={data.keys.gemini} envKey="GEMINI_API_KEY" onChanged={reload} />}
        <KeyRow name="brave" label="Brave Search (optional)" status={data.braveKey} envKey="BRAVE_SEARCH_API_KEY" onChanged={reload} />
        <p className="text-xs text-zinc-600">Currently using: {data.searchCapability === "brave" ? "Brave Search" : data.searchCapability === "gemini" ? "Gemini with Google Search" : "nothing configured"}.</p>
      </Section>
    </>
  );
}

/* ----------------------------------------------------------- career */

export function CareerSection({ data, reload }) {
  const g = useGroup(data, "career", reload);
  const c = g.draft;
  return (
    <>
      <Section title="What you are looking for" description="The agent uses these preferences when it discovers companies." footer={g.saveBar}>
        <Field label="Preferred job titles">{() => <ListInput label="Preferred job titles" value={c.titles} onChange={(v) => g.set("titles", v)} placeholder="Full-Stack Engineer, Frontend Engineer…" />}</Field>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Toggle label="Remote jobs" checked={c.remote} onChange={(v) => g.set("remote", v)} />
          <Toggle label="International opportunities" checked={c.international} onChange={(v) => g.set("international", v)} />
          <Toggle label="Internships" checked={c.internships} onChange={(v) => g.set("internships", v)} />
          <Toggle label="Graduate programmes" checked={c.graduate} onChange={(v) => g.set("graduate", v)} />
          <Toggle label="Entry-level roles" checked={c.entryLevel} onChange={(v) => g.set("entryLevel", v)} />
          <Toggle label="Contract roles" checked={c.contract} onChange={(v) => g.set("contract", v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred countries" hint="Leave empty for worldwide and remote.">{() => <ListInput label="Preferred countries" value={c.countries} onChange={(v) => g.set("countries", v)} placeholder="Add a country" />}</Field>
          <Field label="Preferred industries">{() => <ListInput label="Preferred industries" value={c.industries} onChange={(v) => g.set("industries", v)} placeholder="Fintech, SaaS…" />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum salary (optional)" hint="Yearly, in the listing's currency. Listings that state a lower maximum are skipped; listings with no salary are kept.">
            {(id) => <Input id={id} type="number" min={0} value={c.minSalary ?? ""} onChange={(e) => g.set("minSalary", e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))))} placeholder="No minimum" />}
          </Field>
        </div>
        <Field label="Companies to avoid">{() => <ListInput label="Companies to avoid" value={c.avoidCompanies} onChange={(v) => g.set("avoidCompanies", v)} placeholder="Company name" />}</Field>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------ gmail */

export function GmailSection({ data, params }) {
  const { toast } = useToast();
  const { data: st, loading, error, reload } = useLoad("/api/gmail/status");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    if (params.get("gmail") === "connected") toast("Gmail connected", "success");
    if (params.get("gmail_error")) toast(params.get("gmail_error"), "error");
  }, [params, toast]);

  async function disconnect() {
    setBusy(true);
    try { await api("/api/gmail/disconnect", { method: "POST" }); toast("Gmail disconnected", "success"); setConfirm(false); reload(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  const a = st?.account;
  return (
    <>
      <Section title="Connected account" description="Atlas sends and reads mail through Google's official OAuth sign-in. Your password is never entered here, and tokens are stored encrypted on the server only.">
        {loading && !st ? <div className="h-16 animate-pulse rounded-lg bg-white/[0.04]" /> : error ? <ErrorNote error={error} onRetry={reload} /> : (
          <>
            {!st.configured && <Notice tone="warn" title="Google OAuth is not configured on the server">Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_URL, then redeploy. The README walks through creating the credentials.</Notice>}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.07] p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-400"><Mail size={17} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-100">{a?.email || st.allowedAccount}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{a ? (a.status === "connected" ? `Connected ${timeAgo(a.connectedAt)}` : "Authorisation expired or revoked") : "Not connected"}</div>
              </div>
              {a && <Badge tone={a.status === "connected" ? "green" : "red"}>{a.status === "connected" ? "Connected" : "Reconnect needed"}</Badge>}
            </div>
            {a?.lastError && <Notice tone="error">{a.lastError}</Notice>}
            <div className="flex flex-wrap gap-2">
              <a href="/api/gmail/connect" className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors ${st.configured ? "bg-[rgb(77,141,255)] text-white hover:bg-[rgb(97,155,255)]" : "pointer-events-none bg-white/10 text-zinc-500"}`}>
                {a ? "Reconnect Gmail" : "Connect Gmail"}
              </a>
              {a && <Button variant="danger" onClick={() => setConfirm(true)}>Disconnect</Button>}
            </div>
            <p className="text-xs text-zinc-600">Only {st.allowedAccount} can be connected. Atlas asks for permission to send mail and to read mail, which it uses only to find replies and bounces on threads it started.</p>
          </>
        )}
      </Section>

      {st && (
        <Section title="Sending limits" description="Atlas enforces its own limits on top of Gmail's.">
          <dl className="grid gap-3 sm:grid-cols-3">
            {[["Sent today", `${st.sending.today} / ${st.sending.todayLimit}`], ["Last hour", st.sending.lastHour], ["Your hard cap", `${st.sending.hardCap} / day`]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/[0.07] p-3.5"><dt className="text-xs text-zinc-500">{k}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-white">{v}</dd></div>
            ))}
          </dl>
          <Notice title="About 100 emails a day">
            Google publishes a limit of about {st.sending.gmailPublishedLimit} messages per day for personal Gmail accounts (more for Workspace), so 100 a day is within the quota. Cold outreach at that volume can still trigger spam filtering or a temporary Google block, which is why Atlas starts at a lower daily number, ramps up gradually and spaces sends out. If Google blocks sending, Atlas pauses and tells you. Sending goes through a provider layer, so another service can be added later if you outgrow Gmail.
          </Notice>
        </Section>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={disconnect} busy={busy} danger title="Disconnect Gmail?" confirmLabel="Disconnect">
        Atlas will revoke its access and stop sending and checking for replies. Campaigns will wait until you reconnect.
      </ConfirmDialog>
    </>
  );
}

/* ---------------------------------------------------------- profile */

const blankExp = { title: "", org: "", period: "", bullets: [] };
const blankProject = { name: "", description: "", stack: "", url: "" };
const blankEdu = { institution: "", program: "", status: "" };

export function ProfileSection({ profile, reload }) {
  const { toast } = useToast();
  const [p, setP] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(p) !== JSON.stringify(profile);
  const set = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));
  const update = (key, i, patch) => setP((x) => ({ ...x, [key]: x[key].map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const remove = (key, i) => setP((x) => ({ ...x, [key]: x[key].filter((_, j) => j !== i) }));

  async function save() {
    setSaving(true); setError("");
    try {
      await api("/api/profile", { method: "PUT", body: { ...p, yearsExperience: Number(p.yearsExperience) || 0 } });
      toast("Profile saved", "success"); await reload();
    } catch (e) { setError(e.data?.issues?.[0] ? `${e.data.issues[0].path}: ${e.data.issues[0].message}` : e.message); }
    finally { setSaving(false); }
  }

  const footer = <>{error && <span className="mr-auto text-sm text-red-400">{error}</span>}{dirty && !saving && <span className="text-xs text-zinc-500">Unsaved changes</span>}<Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save profile</Button></>;

  return (
    <>
      <Notice title="This is the AI's source of truth">Emails are written only from this profile and your CV. Anything you leave out will not be claimed, and nothing is added on your behalf.</Notice>
      <div className="h-5" />
      <Section title="Basics" footer={footer}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">{(id) => <Input id={id} value={p.name} onChange={set("name")} />}</Field>
          <Field label="Professional name">{(id) => <Input id={id} value={p.professionalName} onChange={set("professionalName")} />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" value={p.email} onChange={set("email")} />}</Field>
          <Field label="Headline">{(id) => <Input id={id} value={p.headline} onChange={set("headline")} />}</Field>
          <Field label="Portfolio">{(id) => <Input id={id} value={p.portfolio} onChange={set("portfolio")} />}</Field>
          <Field label="GitHub">{(id) => <Input id={id} value={p.github} onChange={set("github")} />}</Field>
          <Field label="LinkedIn">{(id) => <Input id={id} value={p.linkedin} onChange={set("linkedin")} />}</Field>
          <Field label="Years of experience" hint="Emails will never claim more than this.">{(id) => <Input id={id} type="number" min={0} max={60} step="0.5" value={p.yearsExperience} onChange={set("yearsExperience")} />}</Field>
        </div>
        <Field label="Professional summary">{(id) => <Textarea id={id} rows={5} value={p.summary} onChange={set("summary")} maxLength={1500} />}</Field>
        <Field label="Skills" hint="Only list skills you genuinely have.">{() => <ListInput label="Skills" value={p.skills} onChange={(v) => setP((x) => ({ ...x, skills: v }))} placeholder="Add a skill and press Enter" max={60} />}</Field>
      </Section>

      <Section title="Experience">
        {p.experience.map((e, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-white/[0.07] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input aria-label="Title" placeholder="Title" value={e.title} onChange={(ev) => update("experience", i, { title: ev.target.value })} />
              <Input aria-label="Organisation" placeholder="Organisation" value={e.org} onChange={(ev) => update("experience", i, { org: ev.target.value })} />
              <Input aria-label="Period" placeholder="e.g. Jan 2024 – Jun 2024" value={e.period} onChange={(ev) => update("experience", i, { period: ev.target.value })} />
            </div>
            <Textarea aria-label="Highlights, one per line" rows={3} placeholder="One highlight per line" value={e.bullets.join("\n")} onChange={(ev) => update("experience", i, { bullets: ev.target.value.split("\n") })} />
            <button onClick={() => remove("experience", i)} className="text-xs text-zinc-500 hover:text-red-300">Remove</button>
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => setP((x) => ({ ...x, experience: [...x.experience, { ...blankExp }] }))}>Add experience</Button>
      </Section>

      <Section title="Education">
        {p.education.map((e, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-white/[0.07] p-4 sm:grid-cols-[1fr_1fr_160px_auto]">
            <Input aria-label="Institution" placeholder="Institution" value={e.institution} onChange={(ev) => update("education", i, { institution: ev.target.value })} />
            <Input aria-label="Programme" placeholder="Programme" value={e.program} onChange={(ev) => update("education", i, { program: ev.target.value })} />
            <Input aria-label="Status" placeholder="Current student" value={e.status} onChange={(ev) => update("education", i, { status: ev.target.value })} />
            <Button variant="ghost" icon={Trash2} aria-label="Remove education" onClick={() => remove("education", i)} />
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => setP((x) => ({ ...x, education: [...x.education, { ...blankEdu }] }))}>Add education</Button>
      </Section>

      <Section title="Projects">
        {p.projects.map((e, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-white/[0.07] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input aria-label="Project name" placeholder="Name" value={e.name} onChange={(ev) => update("projects", i, { name: ev.target.value })} />
              <Input aria-label="Project URL" placeholder="https://…" value={e.url} onChange={(ev) => update("projects", i, { url: ev.target.value })} />
            </div>
            <Input aria-label="Stack" placeholder="Stack" value={e.stack} onChange={(ev) => update("projects", i, { stack: ev.target.value })} />
            <Textarea aria-label="Description" rows={2} placeholder="What it is and does" value={e.description} onChange={(ev) => update("projects", i, { description: ev.target.value })} />
            <button onClick={() => remove("projects", i)} className="text-xs text-zinc-500 hover:text-red-300">Remove</button>
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => setP((x) => ({ ...x, projects: [...x.projects, { ...blankProject }] }))}>Add project</Button>
      </Section>
    </>
  );
}

/* -------------------------------------------------------- documents */

function formatBytes(n) {
  return n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}

export function DocumentsSection({ data, profile, reloadSettings, reloadProfile }) {
  const { toast } = useToast();
  const docs = useLoad("/api/documents");
  const cv = useGroup(data, "cv", reloadSettings);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState("");
  const [signature, setSignature] = useState(profile.signature);
  const [savingSig, setSavingSig] = useState(false);
  const [preview, setPreview] = useState(false);
  const [del, setDel] = useState(null);
  const cvInput = useRef(null);
  const otherInput = useRef(null);

  const list = docs.data?.documents || [];
  const current = list.find((d) => d.kind === "cv" && d.is_default);
  const others = list.filter((d) => d.kind === "other");
  const sync = data.cvSync;

  async function fetchNow() {
    setSyncing(true);
    try {
      const out = await api("/api/documents/sync", { method: "POST" });
      toast(out.changed ? "CV updated from your CV source" : "CV is already up to date", "success");
      docs.reload(); reloadSettings();
    } catch (e) { toast(e.message, "error"); reloadSettings(); } finally { setSyncing(false); }
  }

  async function upload(kind, file) {
    if (!file) return;
    setUploading(kind);
    try {
      const form = new FormData(); form.set("file", file); form.set("kind", kind);
      await api("/api/documents", { method: "POST", form });
      toast(kind === "cv" ? "CV uploaded" : "Document uploaded", "success"); docs.reload();
    } catch (e) { toast(e.message, "error"); } finally { setUploading(""); if (cvInput.current) cvInput.current.value = ""; if (otherInput.current) otherInput.current.value = ""; }
  }

  async function saveSignature() {
    setSavingSig(true);
    try { await api("/api/profile", { method: "PUT", body: { ...profile, signature } }); toast("Signature saved", "success"); await reloadProfile(); }
    catch (e) { toast(e.message, "error"); } finally { setSavingSig(false); }
  }

  async function remove() {
    try { await api(`/api/documents/${del.id}`, { method: "DELETE" }); toast("Deleted", "success"); setDel(null); docs.reload(); } catch (e) { toast(e.message, "error"); }
  }

  return (
    <>
      <Section title="CV source" description="Atlas can fetch your CV straight from your CV generator, so the attached CV is always the current one and you never upload it again. It refreshes before every send and on a schedule." footer={cv.saveBar}>
        <Field label="CV URL" hint="An https:// address that returns your CV as a PDF file. Atlas downloads it from the server, so it does not need a login.">
          {(id) => <Input id={id} inputMode="url" placeholder="https://modred.dev/…" value={cv.draft.sourceUrl} onChange={(e) => cv.set("sourceUrl", e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Check for a newer CV every (minutes)">{(id) => <Input id={id} type="number" min={5} max={1440} value={cv.draft.cacheMinutes} onChange={(e) => cv.set("cacheMinutes", Math.max(5, Number(e.target.value) || 60))} />}</Field>
        </div>
        <Toggle label="Attach my CV to career outreach automatically" checked={cv.draft.autoAttach} onChange={(v) => cv.set("autoAttach", v)} />
        <div className="flex flex-wrap items-center gap-2.5">
          <Button icon={RefreshCw} loading={syncing} disabled={!data.settings.cv.sourceUrl || cv.dirty} onClick={fetchNow}>Fetch CV now</Button>
          {cv.dirty && <span className="text-xs text-zinc-500">Save the URL first.</span>}
          {sync?.checkedAt && <span className={`text-xs ${sync.ok ? "text-zinc-500" : "text-red-400"}`}>{sync.ok ? `Last checked ${timeAgo(sync.checkedAt)}` : `Last attempt failed: ${sync.error}`}</span>}
        </div>
        {sync && !sync.ok && <Notice tone="warn">If your CV is generated in the browser (for example “print to PDF”), there is no file for Atlas to fetch. Your portfolio needs one route that returns the PDF itself. Until then, the last good copy or an uploaded PDF is used.</Notice>}
      </Section>

      <Section title="Current CV" description={current ? undefined : "No CV is stored yet. Fetch it from your CV source or upload a PDF."}>
        {docs.loading && !docs.data ? <div className="h-14 animate-pulse rounded-lg bg-white/[0.04]" /> : current ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.07] p-4">
            <FileText size={20} className="shrink-0 text-zinc-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-100">{current.filename}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{formatBytes(current.size)} · {current.source === "sync" ? "fetched from your CV source" : "uploaded"} · {formatDateTime(current.created_at)}</div>
            </div>
            <Button size="sm" onClick={() => setPreview((v) => !v)}>{preview ? "Hide preview" : "Preview"}</Button>
            <a href={`/api/documents/${current.id}?download=1`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[13px] font-medium text-zinc-200 hover:bg-white/[0.08]"><Download size={14} />Download</a>
          </div>
        ) : null}
        {preview && current && <iframe title="CV preview" src={`/api/documents/${current.id}`} sandbox="" className="h-[560px] w-full rounded-lg border border-white/[0.08] bg-white" />}
        <div className="flex flex-wrap gap-2">
          <input ref={cvInput} type="file" accept="application/pdf" hidden onChange={(e) => upload("cv", e.target.files?.[0])} />
          <Button icon={Upload} loading={uploading === "cv"} onClick={() => cvInput.current?.click()}>{current ? "Replace with an upload" : "Upload CV (PDF)"}</Button>
        </div>
        <p className="text-xs text-zinc-600">An uploaded CV is replaced the next time the CV source returns a different file.</p>
      </Section>

      <Section title="Default email signature" description="Added to the end of generated emails." footer={<Button variant="primary" loading={savingSig} disabled={signature === profile.signature} onClick={saveSignature}>Save signature</Button>}>
        <Textarea aria-label="Email signature" rows={4} maxLength={500} value={signature} onChange={(e) => setSignature(e.target.value)} />
      </Section>

      <Section title="Other documents" description="Extra files you can attach when sending from Email Studio. PDF, DOCX or text, up to 5 MB.">
        {others.length === 0 ? <p className="text-sm text-zinc-500">No additional documents.</p> : (
          <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.07]">
            {others.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <FileText size={16} className="shrink-0 text-zinc-500" />
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-zinc-200 hover:underline">{d.filename}</a>
                <span className="text-xs text-zinc-600">{formatBytes(d.size)}</span>
                <button aria-label={`Delete ${d.filename}`} onClick={() => setDel(d)} className="rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-red-300"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        <input ref={otherInput} type="file" accept=".pdf,.docx,.txt,application/pdf" hidden onChange={(e) => upload("other", e.target.files?.[0])} />
        <Button icon={Upload} loading={uploading === "other"} onClick={() => otherInput.current?.click()}>Upload document</Button>
      </Section>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} danger title="Delete document?" confirmLabel="Delete">{del?.filename} will be removed.</ConfirmDialog>
    </>
  );
}

/* -------------------------------------------------------- campaigns */

export function CampaignSection({ data, reload }) {
  const { toast } = useToast();
  const g = useGroup(data, "safety", reload);
  const career = useGroup(data, "career", reload);
  const s = g.draft;
  const supp = useLoad("/api/suppression");
  const [kind, setKind] = useState("email");
  const [value, setValue] = useState("");
  const [confirmAuto, setConfirmAuto] = useState(false);

  async function addSupp() {
    try { await api("/api/suppression", { method: "POST", body: { kind, value } }); setValue(""); supp.reload(); toast("Added to the suppression list", "success"); }
    catch (e) { toast(e.data?.issues?.[0]?.message || e.message, "error"); }
  }
  async function removeSupp(id) {
    try { await api("/api/suppression", { method: "DELETE", body: { id } }); supp.reload(); } catch (e) { toast(e.message, "error"); }
  }
  const win = s.sendWindow;
  const setWin = (k, v) => g.set("sendWindow", { ...win, [k]: v });
  const num = (k, min, max) => (e) => g.set(k, Math.max(min, Math.min(max, Math.round(Number(e.target.value) || min))));

  return (
    <>
      <Section title="Sending mode" description="Campaigns start in Approval Mode: every email waits for your review." footer={g.saveBar}>
        <Toggle label="Allow Automatic Mode" description="Lets a campaign send qualifying emails without approval: researched, no flagged problems, and a verified contact. All limits below still apply." checked={s.autoSendEnabled} onChange={(v) => (v ? setConfirmAuto(true) : g.set("autoSendEnabled", false))} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Daily hard cap" hint="Never exceeded, whatever a campaign asks for. Max 100.">{(id) => <Input id={id} type="number" min={1} max={100} value={s.dailyHardCap} onChange={num("dailyHardCap", 1, 100)} />}</Field>
          <Field label="Max per hour">{(id) => <Input id={id} type="number" min={1} max={60} value={s.maxPerHour} onChange={num("maxPerHour", 1, 60)} />}</Field>
          <Field label="Min seconds between sends">{(id) => <Input id={id} type="number" min={30} max={3600} value={s.minIntervalSec} onChange={num("minIntervalSec", 30, 3600)} />}</Field>
        </div>
        <Toggle label="Gradual warm-up" description="Starts at 10 emails a day and adds 5 each day until your target, which is kinder to spam filters." checked={s.warmup} onChange={(v) => g.set("warmup", v)} />
      </Section>

      <Section title="Sending schedule" description="Emails go out only inside this window, in this time zone." footer={g.saveBar}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From (hour)">{(id) => <Input id={id} type="number" min={0} max={23} value={win.startHour} onChange={(e) => setWin("startHour", Math.max(0, Math.min(23, Number(e.target.value) || 0)))} />}</Field>
          <Field label="Until (hour)">{(id) => <Input id={id} type="number" min={1} max={24} value={win.endHour} onChange={(e) => setWin("endHour", Math.max(1, Math.min(24, Number(e.target.value) || 1)))} />}</Field>
          <Field label="Time zone">{(id) => <Input id={id} value={win.timezone} onChange={(e) => setWin("timezone", e.target.value)} placeholder="Africa/Lagos" />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Follow up after (days)">{(id) => <Input id={id} type="number" min={2} max={30} value={s.followUpDays} onChange={num("followUpDays", 2, 30)} />}</Field>
          <Field label="Maximum follow-ups per company" hint="0 turns follow-ups off. Never sent after a reply, rejection or opt-out.">{(id) => <Input id={id} type="number" min={0} max={2} value={s.maxFollowUps} onChange={num("maxFollowUps", 0, 2)} />}</Field>
        </div>
        <Toggle label="Attach CV to outreach by default" checked={s.attachCvDefault} onChange={(v) => g.set("attachCvDefault", v)} />
        <Toggle label="Include an opt-out line" description="Adds a polite line inviting recipients to say no thanks." checked={s.optOutLine} onChange={(v) => g.set("optOutLine", v)} />
      </Section>

      <Section title="Company exclusions" description="Companies here are skipped during discovery." footer={career.saveBar}>
        <ListInput label="Excluded companies" value={career.draft.avoidCompanies} onChange={(v) => career.set("avoidCompanies", v)} placeholder="Company name" />
      </Section>

      <Section title="Suppression list" description="Addresses and domains that will never be emailed. Opt-outs and hard bounces are added automatically.">
        <div className="grid gap-2 sm:grid-cols-[130px_1fr_auto]">
          <Select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="email">Email</option><option value="domain">Domain</option></Select>
          <Input aria-label="Value" placeholder={kind === "email" ? "name@company.com" : "company.com"} value={value} onChange={(e) => setValue(e.target.value)} />
          <Button disabled={value.trim().length < 3} onClick={addSupp}>Add</Button>
        </div>
        {supp.data?.items.length ? (
          <ul className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto rounded-lg border border-white/[0.07]">
            {supp.data.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <Badge>{i.kind}</Badge><span className="min-w-0 flex-1 truncate text-zinc-200">{i.value}</span><span className="hidden text-xs text-zinc-600 sm:block">{i.reason}</span>
                <button aria-label={`Remove ${i.value}`} onClick={() => removeSupp(i.id)} className="rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-zinc-500">Nobody is suppressed yet.</p>}
      </Section>

      <ConfirmDialog open={confirmAuto} onClose={() => setConfirmAuto(false)} onConfirm={() => { g.set("autoSendEnabled", true); setConfirmAuto(false); }} title="Enable Automatic Mode?" confirmLabel="Allow Automatic Mode">
        This only makes it possible. A campaign still sends automatically only if you also turn off “Require my approval” on that campaign. Emails go out under your name, so check the first few drafts in Approval Mode before relying on it.
      </ConfirmDialog>
    </>
  );
}

/* -------------------------------------------------------------- app */

export function AppSection({ data, reload }) {
  const g = useGroup(data, "app", reload);
  return (
    <>
      <Section title="Notifications" footer={g.saveBar}>
        <Toggle label="Show counters in the sidebar" description="Shows how many emails await approval and how many replies are unhandled." checked={g.draft.inboxBadge} onChange={(v) => g.set("inboxBadge", v)} />
      </Section>
      <Section title="Appearance"><p className="text-sm text-zinc-400">Atlas uses its dark theme everywhere.</p></Section>
      <Section title="Security">
        <p className="text-sm leading-relaxed text-zinc-400">Atlas is protected by a single password. Sessions last 7 days. To change the password, generate a new hash with <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] text-zinc-300">npm run hash-password</code> and update <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] text-zinc-300">ADMIN_PASSWORD_HASH</code> on the server.</p>
        <div><Button icon={LogOut} onClick={signOut}>Sign out</Button></div>
      </Section>
      <Section title="Your data" description="Export companies, emails, replies and settings as JSON. API keys, OAuth tokens and file contents are never included.">
        <a href="/api/export" download className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-zinc-200 hover:bg-white/[0.08]"><Download size={15} />Export data</a>
      </Section>
    </>
  );
}
