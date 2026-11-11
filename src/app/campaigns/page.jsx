// src/app/campaigns/page.jsx
"use client";

import { useState } from "react";
import { Check, ChevronDown, Pause, Play, Plus, Rocket, Send, Settings2, Trash2, X } from "lucide-react";
import Link from "next/link";
import {
  api, Badge, Button, Card, ConfirmDialog, cx, Empty, ErrorNote, Field, Input, ListInput, MAIL_LABEL, MAIL_TONE, Modal, Notice,
  Page, PageHeader, Select, SkeletonRows, Tabs, Textarea, Toggle, timeAgo, useLoad, useToast,
} from "../components/ui";

const TONES = ["professional", "friendly", "formal", "persuasive", "casual", "concise", "confident"];

export default function CampaignsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("queue");
  const queue = useLoad("/api/outreach?status=pending_approval,approved,draft&kind=outreach,followup&limit=200");
  const camps = useLoad("/api/campaigns");
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(null); // campaign | "new"

  const pendingCount = queue.data?.counts?.pending || 0;

  async function runNow() {
    setRunning(true);
    try {
      const r = await api("/api/campaigns/run", { method: "POST" });
      if (r.skipped) toast("A run is already in progress.", "info");
      else toast(`Run finished: ${r.sent} sent, ${r.jobs} tasks processed.${r.notes?.length ? ` ${r.notes[0]}` : ""}`, "success");
      queue.reload(); camps.reload();
    } catch (e) { toast(e.message, "error"); } finally { setRunning(false); }
  }

  return (
    <Page wide>
      <PageHeader
        title="Email Campaigns"
        description="Campaigns find companies, research them and draft one email each. In Approval Mode nothing is sent until you approve it here."
        actions={
          <>
            <Button icon={Rocket} loading={running} onClick={runNow}>Run now</Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New campaign</Button>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "queue", label: "Approval queue", count: pendingCount }, { id: "campaigns", label: "Campaigns" }]} />
      <div className="mt-5">
        {tab === "queue" ? <Queue state={queue} onChanged={() => { queue.reload(); camps.reload(); }} /> : <CampaignList state={camps} onEdit={setEditing} onChanged={camps.reload} />}
      </div>
      {editing && <CampaignForm campaign={editing === "new" ? null : editing} safety={camps.data?.safety} defaults={camps.data?.defaults} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); camps.reload(); }} />}
    </Page>
  );
}

/* ------------------------------------------------------------ queue */

function Queue({ state, onChanged }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = state;
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState("");
  const [openId, setOpenId] = useState(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const list = data?.emails || [];
  const pending = list.filter((e) => e.status === "pending_approval");
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = [...selected].filter((id) => pending.some((e) => e.id === id));

  async function act(kind, idList) {
    setBusy(kind);
    try {
      const out = await api(`/api/outreach/${kind}`, { method: "POST", body: { ids: idList } });
      if (kind === "approve") toast(`${out.approved} approved${out.skipped.length ? `, ${out.skipped.length} skipped (${out.skipped[0].reason})` : ""}. They send on schedule within your limits.`, out.approved ? "success" : "error");
      else toast("Rejected", "success");
      setSelected(new Set()); onChanged();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(""); setConfirmReject(false); }
  }

  if (loading && !data) return <SkeletonRows rows={5} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (list.length === 0) return (
    <Card padded={false}><Empty icon={Send} title="The queue is empty" action={<Link href="/agent" className="text-sm font-medium text-[rgb(125,178,255)] hover:underline">Open the AI Career Agent</Link>}>
      Drafted emails wait here for your approval. Start a campaign, or draft one from a company&apos;s page.
    </Empty></Card>
  );

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div className="sticky top-12 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-[#101014] px-3 py-2 lg:top-3">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(77,141,255)]" checked={ids.length === pending.length} onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((p) => p.id)) : new Set())} />
            {ids.length ? `${ids.length} selected` : "Select all"}
          </label>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="danger" disabled={!ids.length} onClick={() => setConfirmReject(true)}>Reject</Button>
            <Button size="sm" variant="success" icon={Check} disabled={!ids.length} loading={busy === "approve"} onClick={() => act("approve", ids)}>Approve{ids.length ? ` (${ids.length})` : ""}</Button>
          </div>
        </div>
      )}
      <Card padded={false} className="overflow-hidden">
        <ul className="divide-y divide-white/[0.06]">
          {list.map((e) => (
            <li key={e.id}>
              <div className="flex items-start gap-3 px-4 py-3.5">
                {e.status === "pending_approval" ? (
                  <input aria-label={`Select email to ${e.to_email}`} type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(77,141,255)]" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                ) : <span className="w-4" />}
                <button className="min-w-0 flex-1 text-left" aria-expanded={openId === e.id} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-zinc-100">{e.company_name || e.to_email}</span>
                    <Badge tone={MAIL_TONE[e.status]}>{MAIL_LABEL[e.status]}</Badge>
                    {e.kind === "followup" && <Badge>Follow-up</Badge>}
                    {e.contact_verification && <Badge tone={e.contact_verification === "verified" ? "green" : "amber"}>{e.contact_verification === "verified" ? "Verified contact" : "Unverified contact"}</Badge>}
                    {e.lint && !e.lint.ok && <Badge tone="amber">{e.lint.issues.length} to review</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-zinc-300">{e.subject}</div>
                  <div className="truncate text-xs text-zinc-600">{e.to_email}{e.campaign_name ? ` · ${e.campaign_name}` : ""} · {timeAgo(e.created_at)}</div>
                </button>
                <ChevronDown size={16} className={cx("mt-1 shrink-0 text-zinc-600 transition-transform", openId === e.id && "rotate-180")} />
              </div>
              {openId === e.id && <QueueEditor email={e} onChanged={onChanged} onApprove={() => act("approve", [e.id])} onReject={() => act("reject", [e.id])} busy={busy} />}
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog open={confirmReject} onClose={() => setConfirmReject(false)} onConfirm={() => act("reject", ids)} title={`Reject ${ids.length} email${ids.length === 1 ? "" : "s"}?`} confirmLabel="Reject" danger busy={busy === "reject"}>
        They will not be sent. You can draft new ones from the company page.
      </ConfirmDialog>
    </div>
  );
}

function QueueEditor({ email, onChanged, onApprove, onReject, busy }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [saving, setSaving] = useState(false);
  const dirty = subject !== email.subject || body !== email.body;

  async function save() {
    setSaving(true);
    try { await api(`/api/outreach/${email.id}`, { method: "PATCH", body: { subject, body } }); toast("Saved. It needs approval again.", "success"); onChanged(); }
    catch (e) { toast(e.message, "error"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 border-t border-white/[0.05] bg-black/20 px-4 py-4 sm:pl-11">
      {email.lint && !email.lint.ok && (
        <Notice tone="warn" title="Automatic checks flagged this draft"><ul className="list-disc pl-4">{email.lint.issues.map((i) => <li key={i}>{i}</li>)}</ul></Notice>
      )}
      {email.error && <Notice tone="error">{email.error}</Notice>}
      <Input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="font-medium" />
      <Textarea aria-label="Body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} className="text-[14px]" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-zinc-600">{email.attach_cv ? "CV will be attached. " : ""}{email.generation ? `Written by ${email.generation.model}.` : ""}</span>
        <div className="flex flex-wrap gap-2">
          {email.status !== "approved" && <Button size="sm" variant="danger" icon={X} loading={busy === "reject"} onClick={onReject}>Reject</Button>}
          {dirty && <Button size="sm" loading={saving} onClick={save}>Save changes</Button>}
          {email.status === "pending_approval" && !dirty && <Button size="sm" variant="success" icon={Check} loading={busy === "approve"} onClick={onApprove}>Approve</Button>}
          {email.status === "approved" && <Badge tone="blue">Approved. Sends on schedule.</Badge>}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- campaigns */

function CampaignList({ state, onEdit, onChanged }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = state;
  const [busy, setBusy] = useState(0);
  const [del, setDel] = useState(null);
  const list = data?.campaigns || [];

  async function setStatus(c, status) {
    setBusy(c.id);
    try { await api(`/api/campaigns/${c.id}`, { method: "PATCH", body: { status } }); toast(status === "active" ? "Campaign started" : "Campaign paused", "success"); onChanged(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(0); }
  }
  async function remove() {
    setBusy(del.id);
    try { await api(`/api/campaigns/${del.id}`, { method: "DELETE" }); toast("Campaign deleted", "success"); setDel(null); onChanged(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(0); }
  }

  if (loading && !data) return <SkeletonRows rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!list.length) return <Card padded={false}><Empty icon={Rocket} title="No campaigns yet">Create one to have the agent find companies and prepare personalised emails every day.</Empty></Card>;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {list.map((c) => (
        <Card key={c.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-white">{c.name}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">{c.config.dailyTarget}/day · {c.config.requireApproval ? "Approval Mode" : "Automatic Mode"} · {c.config.tone}</p>
            </div>
            <Badge tone={c.status === "active" ? "green" : c.status === "paused" ? "amber" : "neutral"}>{c.status[0].toUpperCase() + c.status.slice(1)}</Badge>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[["Drafted", c.total], ["Waiting", c.pending], ["Sent", c.sent]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/[0.06] py-2"><dd className="text-lg font-semibold tabular-nums text-white">{v}</dd><dt className="text-[11px] text-zinc-500">{k}</dt></div>
            ))}
          </dl>
          <p className="mt-3 line-clamp-2 text-xs text-zinc-600">{[...c.config.categories, ...c.config.countries, ...c.config.industries].join(" · ") || "Uses your career preferences"}{c.starts_on || c.ends_on ? ` · ${c.starts_on || "now"} to ${c.ends_on || "open-ended"}` : ""}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {c.status === "active" ? <Button size="sm" icon={Pause} loading={busy === c.id} onClick={() => setStatus(c, "paused")}>Pause</Button> : <Button size="sm" variant="primary" icon={Play} loading={busy === c.id} onClick={() => setStatus(c, "active")}>Start</Button>}
            <Button size="sm" icon={Settings2} onClick={() => onEdit(c)}>Configure</Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel(c)} className="ml-auto" aria-label={`Delete ${c.name}`} />
          </div>
        </Card>
      ))}
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} busy={Boolean(busy)} danger title="Delete campaign?" confirmLabel="Delete">
        Emails already sent stay in Sent Emails. Anything still waiting for approval is cancelled.
      </ConfirmDialog>
    </div>
  );
}

function CampaignForm({ campaign, safety, defaults, onClose, onSaved }) {
  const { toast } = useToast();
  const [name, setName] = useState(campaign?.name || "");
  const [cfg, setCfg] = useState({ ...(defaults || {}), ...(campaign?.config || {}) });
  const [startsOn, setStartsOn] = useState(campaign?.starts_on || "");
  const [endsOn, setEndsOn] = useState(campaign?.ends_on || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const cap = safety?.dailyHardCap ?? 100;
  const autoOk = Boolean(safety?.autoSendEnabled);

  async function save() {
    setBusy(true); setErr("");
    try {
      const body = { name: name.trim(), config: cfg, startsOn: startsOn || null, endsOn: endsOn || null };
      if (campaign) await api(`/api/campaigns/${campaign.id}`, { method: "PATCH", body });
      else await api("/api/campaigns", { method: "POST", body });
      toast(campaign ? "Campaign updated" : "Campaign created. Start it when you are ready.", "success");
      onSaved();
    } catch (e) { setErr(e.data?.issues?.[0] ? `${e.data.issues[0].path}: ${e.data.issues[0].message}` : e.message); setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} busy={busy} wide title={campaign ? "Configure campaign" : "New campaign"}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}>{campaign ? "Save changes" : "Create campaign"}</Button></>}>
      <div className="space-y-5">
        {err && <Notice tone="error">{err}</Notice>}
        <Field label="Campaign name">{(id) => <Input id={id} data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Remote full-stack, Nov" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Daily email target" hint={`Default 20. Your safety cap is ${cap}/day; Gmail's own limit for a personal account is about 500 messages/day, and new sending patterns are ramped up gradually if warm-up is on.`}>
            {(id) => <Input id={id} type="number" min={1} max={cap} value={cfg.dailyTarget} onChange={(e) => set("dailyTarget", Math.max(1, Math.min(cap, Number(e.target.value) || 1)))} />}
          </Field>
          <Field label="Email tone">{(id) => <Select id={id} value={cfg.tone} onChange={(e) => set("tone", e.target.value)} className="capitalize">{TONES.map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
        </div>
        {cfg.dailyTarget > 40 && <Notice tone="warn">High daily volumes to cold contacts raise the chance of spam flags. Keep the target modest unless replies are healthy.</Notice>}
        <Field label="Job categories">{() => <ListInput label="Job categories" value={cfg.categories} onChange={(v) => set("categories", v)} placeholder="Full-Stack Engineering, Backend…" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target countries" hint="Empty means worldwide and remote.">{() => <ListInput label="Target countries" value={cfg.countries} onChange={(v) => set("countries", v)} placeholder="Add a country" />}</Field>
          <Field label="Company industries">{() => <ListInput label="Company industries" value={cfg.industries} onChange={(v) => set("industries", v)} placeholder="Fintech, SaaS…" />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start date">{(id) => <Input id={id} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}</Field>
          <Field label="End date">{(id) => <Input id={id} type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} />}</Field>
          <Field label="Follow-up after (days)">{(id) => <Input id={id} type="number" min={2} max={30} value={cfg.followUpDays} onChange={(e) => set("followUpDays", Number(e.target.value) || 5)} />}</Field>
        </div>
        <div className="space-y-4 rounded-lg border border-white/[0.07] p-4">
          <Toggle label="Require my approval before sending" description={autoOk ? "Turn off to let qualifying, researched emails to verified contacts send automatically within your limits." : "Automatic Mode is off. Enable it in Settings → Campaigns first."} checked={cfg.requireApproval} disabled={!autoOk && cfg.requireApproval} onChange={(v) => set("requireApproval", v)} />
          <Toggle label="Attach my CV" description="Fetched fresh from your CV source when sending." checked={cfg.attachCv} onChange={(v) => set("attachCv", v)} />
          <Toggle label="Allow unverified contacts" description="Includes published addresses that are not clearly a hiring inbox. Off by default." checked={cfg.allowUnverified} onChange={(v) => set("allowUnverified", v)} />
        </div>
      </div>
    </Modal>
  );
}
