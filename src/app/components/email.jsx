// src/app/components/email.jsx
"use client";

import { useState } from "react";
import { Check, Copy, Paperclip, Send, Sparkles, Wand2 } from "lucide-react";
import { api, Badge, Button, cx, Input, Modal, Notice, Textarea, useToast } from "./ui";

const wc = (s) => (s.match(/\S+/g) || []).length;

const REFINE_ACTIONS = [
  { id: "shorter", label: "Make shorter" },
  { id: "professional", label: "More professional" },
  { id: "friendlier", label: "Friendlier" },
  { id: "improve", label: "Improve wording" },
];

export function EmailEditor({
  subject, body, onChange, toLabel, lint, refining, onRefine, onRegenerate, regenerating, onSend, sendLabel = "Send email", sending, children,
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const busy = Boolean(refining || regenerating);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      toast("Email copied to clipboard", "success");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Could not copy. Select the text and copy it manually.", "error");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0d10]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.07] px-3 py-2.5">
        {onRegenerate && (
          <Button size="sm" variant="secondary" icon={Sparkles} loading={regenerating} disabled={busy && !regenerating} onClick={onRegenerate}>
            Regenerate
          </Button>
        )}
        {REFINE_ACTIONS.map((a) => (
          <Button key={a.id} size="sm" variant="ghost" loading={refining === a.id} disabled={busy} onClick={() => onRefine(a.id)}>
            {a.label}
          </Button>
        ))}
        <div className="ml-auto">
          <Button size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="divide-y divide-white/[0.06]">
        <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="w-14 shrink-0 text-zinc-500">To</span>
          <span className="min-w-0 truncate text-zinc-200">{toLabel}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-1.5">
          <label htmlFor="email-subject" className="w-14 shrink-0 text-sm text-zinc-500">Subject</label>
          <Input
            id="email-subject"
            value={subject}
            maxLength={200}
            onChange={(e) => onChange({ subject: e.target.value, body })}
            className="h-9 border-transparent bg-transparent px-0 font-medium hover:border-transparent focus:ring-0"
            aria-label="Email subject"
          />
        </div>
        <div className={cx("relative", busy && "opacity-60")}>
          <Textarea
            aria-label="Email body"
            value={body}
            rows={14}
            onChange={(e) => onChange({ subject, body: e.target.value })}
            className="min-h-[320px] rounded-none border-0 bg-transparent px-4 py-3.5 text-[14.5px] leading-[1.65] hover:border-0 focus:ring-0"
            readOnly={busy}
          />
        </div>
      </div>

      {lint && !lint.ok && (
        <div className="border-t border-white/[0.07] p-3">
          <Notice tone="warn" title="Worth a look before sending">
            <ul className="list-disc space-y-0.5 pl-4">
              {lint.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] px-4 py-3">
        <span className="text-xs tabular-nums text-zinc-600">{wc(body)} words</span>
        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">{children}</div>
        <Button variant="primary" icon={Send} loading={sending} disabled={busy || !subject.trim() || !body.trim()} onClick={onSend}>
          {sendLabel}
        </Button>
      </div>
    </div>
  );
}

// Step 1: freeze the reviewed content on the server. Step 2: show exactly that copy in a dialog.
// Step 3: only "Confirm & Send" calls the send endpoint, with the hash of what was shown.
export function useSendFlow({ onSent }) {
  const { toast } = useToast();
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function start(payload) {
    setPreparing(true);
    setError("");
    try {
      setPrepared(await api("/api/studio/prepare", { method: "POST", body: payload }));
    } catch (err) {
      toast(err.data?.issues?.[0]?.message || err.message, "error");
    } finally {
      setPreparing(false);
    }
  }

  async function cancel() {
    if (sending) return;
    const id = prepared?.id;
    setPrepared(null);
    setError("");
    if (id) api("/api/outreach/reject", { method: "POST", body: { ids: [id] } }).catch(() => {});
  }

  async function confirm() {
    setSending(true);
    setError("");
    try {
      await api(`/api/outreach/${prepared.id}/send`, { method: "POST", body: { confirmedHash: prepared.hash } });
      toast(`Email sent to ${prepared.email.to}`, "success");
      const sent = prepared;
      setPrepared(null);
      onSent?.(sent);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const e = prepared?.email;
  const dialog = (
    <Modal
      open={Boolean(prepared)}
      onClose={cancel}
      busy={sending}
      wide
      title="Send this email?"
      description="Nothing has been sent yet. Check the details below."
      footer={
        <>
          <Button variant="secondary" onClick={cancel} disabled={sending} data-autofocus>Cancel</Button>
          <Button variant="primary" icon={Send} onClick={confirm} loading={sending}>Confirm &amp; Send</Button>
        </>
      }
    >
      {e && (
        <div className="space-y-4">
          {prepared.warnings.map((w) => (
            <Notice key={w} tone="warn">{w}</Notice>
          ))}
          {error && <Notice tone="error">{error}</Notice>}
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-zinc-500">To</dt>
            <dd className="min-w-0 break-words text-zinc-100">{e.toName ? `${e.toName} <${e.to}>` : e.to}</dd>
            <dt className="text-zinc-500">Subject</dt>
            <dd className="min-w-0 break-words font-medium text-white">{e.subject}</dd>
            {e.attachCv && (
              <>
                <dt className="text-zinc-500">Attached</dt>
                <dd className="flex items-center gap-1.5 text-zinc-300"><Paperclip size={13} /> Your CV (PDF)</dd>
              </>
            )}
          </dl>
          <div className="max-h-[40dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-black/30 p-4 text-[14px] leading-relaxed text-zinc-200">
            {e.body}
          </div>
        </div>
      )}
    </Modal>
  );

  return { start, preparing, dialog };
}

export function LintBadge({ lint }) {
  if (!lint) return null;
  return lint.ok ? <Badge tone="green"><Check size={11} /> Checks passed</Badge> : <Badge tone="amber"><Wand2 size={11} /> {lint.issues.length} to review</Badge>;
}
