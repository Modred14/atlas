// src/app/inbox/page.jsx
"use client";

import { useState } from "react";
import { Inbox as InboxIcon, RefreshCw, Reply, Sparkles } from "lucide-react";
import Link from "next/link";
import { api, Badge, Button, CATEGORY_LABEL, CATEGORY_TONE, Card, Empty, ErrorNote, formatDateTime, Modal, Notice, Page, PageHeader, Select, SkeletonRows, timeAgo, useLoad, useToast } from "../components/ui";
import { EmailEditor, useSendFlow } from "../components/email";

const FILTERS = [
  ["", "All replies"], ["interested", "Interested"], ["interview", "Interview"], ["more_info", "More info"],
  ["follow_up_required", "Follow-up required"], ["rejection", "Rejection"], ["other", "Other"], ["opt_out", "Opt-outs"], ["bounce", "Bounces"],
];

export default function InboxPage() {
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const { data, error, loading, reload } = useLoad(`/api/inbox${category ? `?category=${category}` : ""}`);
  const [syncing, setSyncing] = useState(false);
  const [openId, setOpenId] = useState(null);
  const messages = data?.messages || [];
  const gmailOk = data?.gmail === "connected";

  async function sync() {
    setSyncing(true);
    try {
      const out = await api("/api/inbox/sync", { method: "POST" });
      toast(out.added ? `${out.added} new ${out.added === 1 ? "reply" : "replies"}` : "No new replies", "success");
      reload();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Page wide>
      <PageHeader
        title="Responses & Inbox"
        description="Replies to emails Atlas sent, sorted by what they mean. Replies are suggested for you to review. Nothing is sent automatically."
        actions={<Button icon={RefreshCw} loading={syncing} onClick={sync} disabled={!gmailOk}>Check for replies</Button>}
      />

      {data && !gmailOk && (
        <div className="mb-4">
          <Notice tone="warn" title={data.gmail === "disconnected" ? "Gmail is not connected" : "Gmail needs to be reconnected"} action={<Link href="/settings?tab=gmail" className="shrink-0 text-sm font-medium text-amber-200 hover:underline">Open settings</Link>}>
            Atlas reads only threads it started, to find replies.
          </Notice>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <Select aria-label="Filter replies" value={category} onChange={(e) => setCategory(e.target.value)} className="w-52">
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {data?.lastSync && <span className="hidden text-xs text-zinc-600 sm:block">Last checked {timeAgo(data.lastSync.lastSyncAt)}</span>}
      </div>

      {error && <ErrorNote error={error} onRetry={reload} />}

      <Card padded={false} className="overflow-hidden">
        {loading && !data ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : messages.length === 0 ? (
          <Empty icon={InboxIcon} title="No replies yet">Replies to your outreach will appear here after Atlas checks Gmail. This happens automatically, or use Check for replies.</Empty>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {messages.map((m) => (
              <li key={m.id}>
                <button onClick={() => setOpenId(m.id)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.handled ? "bg-transparent" : "bg-[rgb(77,141,255)]"}`} aria-label={m.handled ? "Handled" : "Unhandled"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-zinc-100">{m.from_name || m.from_email}</span>
                      {m.company_name && <span className="truncate text-xs text-zinc-500">{m.company_name}</span>}
                      <Badge tone={CATEGORY_TONE[m.category]}>{CATEGORY_LABEL[m.category]}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-zinc-300">{m.subject}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-600">{m.snippet}</div>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-600">{timeAgo(m.received_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {openId && <MessageModal id={openId} onClose={() => { setOpenId(null); reload(); }} />}
    </Page>
  );
}

function MessageModal({ id, onClose }) {
  const { toast } = useToast();
  const { data, loading, error } = useLoad(`/api/inbox/${id}`);
  const m = data?.message;
  const [reply, setReply] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(null);

  const send = useSendFlow({
    onSent: async () => {
      await api(`/api/inbox/${id}`, { method: "PATCH", body: { handled: true } }).catch(() => {});
      setReply(null);
    },
  });

  async function suggest() {
    setBusy(true);
    try {
      setReply(await api(`/api/inbox/${id}/suggest-reply`, { method: "POST", body: {} }));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function refine(action) {
    setRefining(action);
    try {
      const out = await api("/api/studio/refine", { method: "POST", body: { subject: reply.subject, body: reply.body, action } });
      setReply((r) => ({ ...r, subject: out.subject, body: out.body, lint: null }));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setRefining(null);
    }
  }

  async function markHandled(handled) {
    await api(`/api/inbox/${id}`, { method: "PATCH", body: { handled } }).catch((e) => toast(e.message, "error"));
    onClose();
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        wide
        title={m?.subject || "Message"}
        description={m && `${m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email} · ${formatDateTime(m.received_at)}`}
        footer={
          m && !reply && (
            <>
              <Button variant="ghost" onClick={() => markHandled(!m.handled)}>{m.handled ? "Mark unhandled" : "Mark handled"}</Button>
              {!["bounce", "opt_out", "auto_reply"].includes(m.category) && (
                <Button variant="primary" icon={Sparkles} loading={busy} onClick={suggest}>Suggest a reply</Button>
              )}
            </>
          )
        }
      >
        {loading && !m ? <SkeletonRows rows={4} /> : error ? <ErrorNote error={error} /> : m && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={CATEGORY_TONE[m.category]}>{CATEGORY_LABEL[m.category]}</Badge>
              {m.company_name && <span className="text-sm text-zinc-500">{m.company_name}</span>}
            </div>
            {m.category_reason && <p className="text-xs text-zinc-500">Why: {m.category_reason}</p>}
            {m.category === "opt_out" && <Notice tone="success">This address is now on your suppression list and the company is marked Do Not Contact.</Notice>}
            <div className="whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-black/30 p-4 text-[14px] leading-relaxed text-zinc-200">{m.body}</div>

            {reply && (
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-medium text-zinc-200">Suggested reply</h3>
                <EmailEditor
                  subject={reply.subject}
                  body={reply.body}
                  lint={reply.lint}
                  toLabel={reply.toName ? `${reply.toName} <${reply.to}>` : reply.to}
                  refining={refining}
                  onRefine={refine}
                  onRegenerate={suggest}
                  regenerating={busy}
                  onChange={(v) => setReply((r) => ({ ...r, ...v }))}
                  sendLabel="Send reply"
                  sending={send.preparing}
                  onSend={() => send.start({ toEmail: reply.to, toName: reply.toName || "", subject: reply.subject, body: reply.body, attachCv: false, kind: "reply", inboxId: id })}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
      {send.dialog}
    </>
  );
}
