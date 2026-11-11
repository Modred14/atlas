// src/app/sent/page.jsx
"use client";

import { useState } from "react";
import { MailCheck, Paperclip, Search } from "lucide-react";
import { Badge, Card, Empty, ErrorNote, formatDateTime, Input, MAIL_LABEL, MAIL_TONE, Modal, Page, PageHeader, Select, SkeletonRows, useDebounced, useLoad } from "../components/ui";

const KIND = { outreach: "Outreach", followup: "Follow-up", studio: "Email Studio", reply: "Reply" };

export default function SentPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("sent,bounced,failed,sending");
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad(`/api/outreach?status=${status}&limit=200${dq ? `&q=${encodeURIComponent(dq)}` : ""}`);
  const [open, setOpen] = useState(null);
  const list = data?.emails || [];

  return (
    <Page wide>
      <PageHeader title="Sent Emails" description="Every email sent from Atlas through your Gmail. “Sent” means Gmail accepted it. A later bounce updates the status." />

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <Input aria-label="Search sent emails" placeholder="Search recipient, company or subject" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48">
          <option value="sent,bounced,failed,sending">All</option>
          <option value="sent">Sent</option>
          <option value="bounced">Bounced</option>
          <option value="failed">Failed</option>
        </Select>
      </div>

      {error && <ErrorNote error={error} onRetry={reload} />}

      <Card padded={false} className="overflow-hidden">
        {loading && !data ? (
          <div className="p-4"><SkeletonRows rows={6} /></div>
        ) : list.length === 0 ? (
          <Empty icon={MailCheck} title={dq || status !== "sent,bounced,failed,sending" ? "No matching emails" : "Nothing sent yet"}>
            Emails you send from Email Studio, replies and campaigns will be listed here.
          </Empty>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] text-left text-xs font-medium text-zinc-500">
                    <th className="px-4 py-2.5 font-medium">Recipient</th>
                    <th className="px-3 py-2.5 font-medium">Company</th>
                    <th className="px-3 py-2.5 font-medium">Subject</th>
                    <th className="px-3 py-2.5 font-medium">Sent</th>
                    <th className="px-3 py-2.5 font-medium">Campaign</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {list.map((e) => (
                    <tr key={e.id} tabIndex={0} onClick={() => setOpen(e)} onKeyDown={(ev) => ev.key === "Enter" && setOpen(e)} className="cursor-pointer transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none">
                      <td className="max-w-[220px] px-4 py-3"><div className="truncate text-zinc-200">{e.to_name || e.to_email}</div>{e.to_name && <div className="truncate text-xs text-zinc-600">{e.to_email}</div>}</td>
                      <td className="max-w-[160px] truncate px-3 py-3 text-zinc-400">{e.company_name || "—"}</td>
                      <td className="max-w-[300px] truncate px-3 py-3 text-zinc-300">{e.subject}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-500">{formatDateTime(e.sent_at)}</td>
                      <td className="max-w-[140px] truncate px-3 py-3 text-zinc-500">{e.campaign_name || KIND[e.kind]}</td>
                      <td className="px-4 py-3"><Badge tone={MAIL_TONE[e.status]}>{MAIL_LABEL[e.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-white/[0.06] md:hidden">
              {list.map((e) => (
                <li key={e.id}>
                  <button onClick={() => setOpen(e)} className="block w-full px-4 py-3.5 text-left active:bg-white/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-zinc-200">{e.to_name || e.to_email}</span>
                      <Badge tone={MAIL_TONE[e.status]}>{MAIL_LABEL[e.status]}</Badge>
                    </div>
                    <div className="mt-1 truncate text-sm text-zinc-400">{e.subject}</div>
                    <div className="mt-1 text-xs text-zinc-600">{[e.company_name, formatDateTime(e.sent_at)].filter(Boolean).join(" · ")}</div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} wide title={open?.subject || ""} description={open && `${KIND[open.kind]} · ${formatDateTime(open.sent_at || open.created_at)}`}>
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <span>To <span className="text-zinc-200">{open.to_name ? `${open.to_name} <${open.to_email}>` : open.to_email}</span></span>
              <Badge tone={MAIL_TONE[open.status]}>{MAIL_LABEL[open.status]}</Badge>
              {open.attach_cv && <Badge><Paperclip size={11} /> CV attached</Badge>}
            </div>
            {open.error && <div className="rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3.5 py-2.5 text-sm text-red-200">{open.error}</div>}
            <div className="whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-black/30 p-4 text-[14px] leading-relaxed text-zinc-200">{open.body}</div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
