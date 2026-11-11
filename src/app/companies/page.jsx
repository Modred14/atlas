// src/app/companies/page.jsx
"use client";

import { useState } from "react";
import { ArrowDownUp, Building2, Download, ExternalLink, Plus, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  api, Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Notice, Page, PageHeader, Select, SkeletonRows,
  STATUS_LABEL, STATUS_TONE, Textarea, timeAgo, useDebounced, useLoad, useToast,
} from "../components/ui";

const STATUSES = Object.keys(STATUS_LABEL);

function Verification({ v }) {
  if (v === "verified") return <Badge tone="green"><ShieldCheck size={11} /> Verified</Badge>;
  if (v === "unverified") return <Badge tone="amber"><ShieldAlert size={11} /> Unverified</Badge>;
  return <span className="text-xs text-zinc-600">No contact</span>;
}

export default function CompaniesPage() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [verified, setVerified] = useState("");
  const [sort, setSort] = useState("discovered_at");
  const [dir, setDir] = useState("desc");
  const dq = useDebounced(q);
  const qs = new URLSearchParams({ sort, dir, ...(dq && { q: dq }), ...(status && { status }), ...(verified && { verified }) });
  const { data, error, loading, reload } = useLoad(`/api/companies?${qs}`);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const list = data?.companies || [];

  const toggleSort = (col) => {
    if (sort === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(col); setDir(col === "name" ? "asc" : "desc"); }
  };
  const th = (col, label, className = "") => (
    <th className={`px-3 py-2.5 font-medium ${className}`}>
      <button onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-zinc-300">
        {label}<ArrowDownUp size={11} className={sort === col ? "text-[rgb(77,141,255)]" : "opacity-40"} />
      </button>
    </th>
  );

  return (
    <Page wide>
      <PageHeader
        title="Companies"
        description="Companies found by the agent or added by you, with what was researched and who to contact."
        actions={
          <>
            <a href="/api/companies/export" download className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.08]">
              <Download size={15} /> Export CSV
            </a>
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add company</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-2.5 sm:grid-cols-[1fr_180px_170px]">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <Input aria-label="Search companies" placeholder="Search name, industry, location" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Filter by contact" value={verified} onChange={(e) => setVerified(e.target.value)}>
          <option value="">Any contact</option>
          <option value="verified">Verified contact</option>
          <option value="unverified">No verified contact</option>
        </Select>
      </div>

      {error && <ErrorNote error={error} onRetry={reload} />}

      <Card padded={false} className="overflow-hidden">
        {loading && !data ? (
          <div className="p-4"><SkeletonRows rows={7} /></div>
        ) : list.length === 0 ? (
          <Empty icon={Building2} title={dq || status || verified ? "No companies match" : "No companies yet"} action={!dq && !status && !verified && <Link href="/agent" className="text-sm font-medium text-[rgb(125,178,255)] hover:underline">Run the AI Career Agent</Link>}>
            {dq || status || verified ? "Try clearing a filter." : "Let the agent discover companies from real job listings, or add one yourself."}
          </Empty>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] text-left text-xs text-zinc-500">
                    {th("name", "Company", "pl-4")}
                    {th("industry", "Industry")}
                    <th className="px-3 py-2.5 font-medium">Contact</th>
                    <th className="px-3 py-2.5 font-medium">Roles</th>
                    {th("status", "Status")}
                    {th("last_contacted_at", "Last contacted", "pr-4")}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {list.map((c) => (
                    <tr key={c.id} tabIndex={0} onClick={() => setOpenId(c.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(c.id)} className="cursor-pointer transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none">
                      <td className="max-w-[240px] py-3 pl-4 pr-3">
                        <div className="truncate font-medium text-zinc-100">{c.name}</div>
                        <div className="truncate text-xs text-zinc-600">{[c.domain, c.location].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-3 text-zinc-400">{c.industry || "—"}</td>
                      <td className="max-w-[220px] px-3 py-3"><div className="flex flex-col items-start gap-1"><Verification v={c.best_verification} />{c.best_email && <span className="max-w-full truncate text-xs text-zinc-500">{c.best_email}</span>}</div></td>
                      <td className="px-3 py-3 tabular-nums text-zinc-400">{c.roles?.length || 0}</td>
                      <td className="px-3 py-3"><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge></td>
                      <td className="whitespace-nowrap py-3 pl-3 pr-4 text-zinc-500">{c.last_contacted_at ? timeAgo(c.last_contacted_at) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-white/[0.06] lg:hidden">
              {list.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setOpenId(c.id)} className="block w-full px-4 py-3.5 text-left active:bg-white/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-zinc-100">{c.name}</span>
                      <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    </div>
                    <div className="mt-1 truncate text-xs text-zinc-500">{[c.industry, c.location].filter(Boolean).join(" · ") || c.domain || "—"}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><Verification v={c.best_verification} />{c.roles?.length > 0 && <span className="text-xs text-zinc-600">{c.roles.length} role{c.roles.length > 1 ? "s" : ""}</span>}</div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {adding && <AddCompany onClose={() => setAdding(false)} onAdded={(c, created) => { setAdding(false); reload(); toast(created ? `${c.name} added` : `${c.name} already exists`, created ? "success" : "info"); if (!created) setOpenId(c.id); }} />}
      {openId && <CompanyModal id={openId} onClose={() => { setOpenId(null); reload(); }} />}
    </Page>
  );
}

function AddCompany({ onClose, onAdded }) {
  const [f, setF] = useState({ name: "", website: "", industry: "", location: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const out = await api("/api/companies", { method: "POST", body: f });
      onAdded(out.company, out.created);
    } catch (error) { setErr(error.data?.issues?.[0]?.message || error.message); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} busy={busy} title="Add company" description="Duplicates are detected by name and website."
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} disabled={!f.name.trim()} onClick={submit}>Add company</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        {err && <Notice tone="error">{err}</Notice>}
        <Field label="Company name">{(id) => <Input id={id} data-autofocus value={f.name} onChange={set("name")} />}</Field>
        <Field label="Website" hint="Needed for research. Atlas reads only public pages.">{(id) => <Input id={id} placeholder="https://example.com" value={f.website} onChange={set("website")} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Industry">{(id) => <Input id={id} value={f.industry} onChange={set("industry")} />}</Field>
          <Field label="Location">{(id) => <Input id={id} value={f.location} onChange={set("location")} />}</Field>
        </div>
        <Field label="Description">{(id) => <Textarea id={id} rows={3} value={f.description} onChange={set("description")} />}</Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CompanyModal({ id, onClose }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = useLoad(`/api/companies/${id}`);
  const c = data?.company;
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState(null);
  const [contact, setContact] = useState({ email: "", name: "", role: "" });
  const [confirmDnc, setConfirmDnc] = useState(false);

  const run = (key, fn, ok) => async () => {
    setBusy(key);
    try { const out = await fn(); if (ok) toast(typeof ok === "function" ? ok(out) : ok, "success"); await reload(); }
    catch (e) { toast(e.message, "error"); }
    finally { setBusy(""); }
  };

  const research = run("research", () => api(`/api/companies/${id}/research`, { method: "POST" }), (o) =>
    o.ok ? `Researched. ${o.contacts} contact${o.contacts === 1 ? "" : "s"} found.` : o.reason === "no_website" ? "No official website could be confirmed." : "Could not read the website.");
  const draft = run("draft", () => api(`/api/companies/${id}/draft`, { method: "POST", body: { allowUnverified: false } }), "Draft created. Find it in Email Campaigns.");
  const setStatus = (status) => run("status", () => api(`/api/companies/${id}`, { method: "PATCH", body: { status } }))();
  const saveNotes = run("notes", () => api(`/api/companies/${id}`, { method: "PATCH", body: { notes } }), "Notes saved");
  const addContact = run("contact", async () => { await api(`/api/companies/${id}/contacts`, { method: "POST", body: contact }); setContact({ email: "", name: "", role: "" }); }, "Contact added as unverified");

  return (
    <>
      <Modal open onClose={onClose} wide title={c?.name || "Company"} description={c && [c.industry, c.location].filter(Boolean).join(" · ")}>
        {loading && !c ? <SkeletonRows rows={5} /> : error ? <ErrorNote error={error} /> : c && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Status" value={c.status} onChange={(e) => (e.target.value === "do_not_contact" ? setConfirmDnc(true) : setStatus(e.target.value))} className="w-48">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
              {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[rgb(125,178,255)] hover:underline">{c.domain}<ExternalLink size={12} /></a>}
              <div className="ml-auto flex gap-2">
                <Button size="sm" loading={busy === "research"} onClick={research}>{c.researched_at ? "Research again" : "Research"}</Button>
                <Button size="sm" variant="primary" loading={busy === "draft"} onClick={draft} disabled={c.status === "do_not_contact"}>Draft email</Button>
              </div>
            </div>

            {(c.description || c.research?.whatTheyDo) && (
              <section>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">What they do</h3>
                <p className="text-sm leading-relaxed text-zinc-300">{c.research?.whatTheyDo || c.description}</p>
                {c.research?.engineeringNotes && <p className="mt-2 text-sm leading-relaxed text-zinc-500">{c.research.engineeringNotes}</p>}
                {c.research_quality != null && <p className="mt-2 text-xs text-zinc-600">Research depth {c.research_quality}/100{c.research_quality < 45 ? ". Too thin to personalise an email." : ""}</p>}
                {c.research?.note && <p className="mt-2 text-sm text-amber-300">{c.research.note}</p>}
              </section>
            )}

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Recruitment contacts</h3>
              {c.contacts.length === 0 ? (
                <p className="text-sm text-zinc-500">No contact has been published on this company&apos;s own site. Atlas will not guess addresses.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.07]">
                  {c.contacts.map((k) => (
                    <li key={k.id} className="px-3.5 py-2.5">
                      <div className="flex flex-wrap items-center gap-2"><span className="break-all text-sm text-zinc-200">{k.email}</span><Verification v={k.verification} />{k.verification === "invalid" && <Badge tone="red">Invalid</Badge>}</div>
                      <p className="mt-1 text-xs text-zinc-600">{[k.name, k.role].filter(Boolean).join(", ")}{k.verification_note ? `${k.name || k.role ? " · " : ""}${k.verification_note}` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input aria-label="Contact email" placeholder="Add contact email" value={contact.email} onChange={(e) => setContact((x) => ({ ...x, email: e.target.value }))} />
                <Input aria-label="Contact name" placeholder="Name (optional)" value={contact.name} onChange={(e) => setContact((x) => ({ ...x, name: e.target.value }))} />
                <Button loading={busy === "contact"} disabled={!contact.email.includes("@")} onClick={addContact}>Add</Button>
              </div>
            </section>

            {c.roles?.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Relevant opportunities</h3>
                <ul className="space-y-1.5">
                  {c.roles.map((r) => (
                    <li key={r.url} className="flex items-center justify-between gap-3 text-sm">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-zinc-300 hover:text-white hover:underline">{r.title}</a>
                      <span className="shrink-0 text-xs text-zinc-600">{r.location || r.source}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Notes</h3>
              <Textarea aria-label="Notes" rows={3} value={notes ?? c.notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
              {notes !== null && notes !== (c.notes ?? "") && <div className="mt-2"><Button size="sm" loading={busy === "notes"} onClick={saveNotes}>Save notes</Button></div>}
            </section>

            {c.history.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Outreach history</h3>
                <ul className="space-y-1.5 text-sm">
                  {c.history.map((h) => <li key={h.id} className="flex justify-between gap-3"><span className="min-w-0 truncate text-zinc-300">{h.subject}</span><span className="shrink-0 text-xs text-zinc-600">{h.status.replace("_", " ")} · {timeAgo(h.sent_at || h.created_at)}</span></li>)}
                </ul>
              </section>
            )}
            <p className="text-xs text-zinc-600">Discovered {timeAgo(c.discovered_at)} via {c.source}.</p>
          </div>
        )}
      </Modal>
      <Modal open={confirmDnc} onClose={() => setConfirmDnc(false)} title="Mark as Do Not Contact?"
        footer={<><Button variant="secondary" onClick={() => setConfirmDnc(false)}>Cancel</Button><Button variant="danger" onClick={() => { setConfirmDnc(false); setStatus("do_not_contact"); }}>Mark Do Not Contact</Button></>}>
        <p className="text-sm leading-relaxed text-zinc-400">Their contacts go on the suppression list and any email waiting for this company is cancelled.</p>
      </Modal>
    </>
  );
}
