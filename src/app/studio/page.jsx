// src/app/studio/page.jsx
"use client";

import { useState } from "react";
import { PenLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { api, Button, Card, cx, Empty, Field, Input, Notice, Page, PageHeader, Select, Textarea, Toggle, useLoad, useToast } from "../components/ui";
import { EmailEditor, useSendFlow } from "../components/email";

const TONES = ["professional", "friendly", "formal", "persuasive", "casual", "concise", "confident"];

const EXAMPLES = [
  "Write an email to a company explaining that I am interested in joining their engineering team. Mention my experience building full-stack applications and include my portfolio.",
  "Write an email to a recruiter thanking them for their response and expressing my interest in the internship opportunity.",
  "Write a professional email requesting a meeting with a potential business partner.",
];

export default function StudioPage() {
  const { toast } = useToast();
  const { data: gmail } = useLoad("/api/gmail/status");
  const [form, setForm] = useState({ toEmail: "", toName: "", purpose: "", tone: "professional", extra: "" });
  const [draft, setDraft] = useState(null); // { subject, body, lint }
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(null);
  const [attachCv, setAttachCv] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const send = useSendFlow({
    onSent: (s) => {
      setSentTo(s.email.to);
      setDirty(false);
    },
  });

  function validate() {
    const next = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.toEmail.trim())) next.toEmail = "Enter a valid email address";
    if (form.purpose.trim().length < 10) next.purpose = "Describe what the email should say";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function generate() {
    if (!validate()) return;
    if (draft && dirty && !window.confirm("Regenerating replaces the edits you made. Continue?")) return;
    setGenerating(true);
    setSentTo(null);
    try {
      const out = await api("/api/studio/generate", { method: "POST", body: { ...form, toEmail: form.toEmail.trim() } });
      setDraft({ subject: out.subject, body: out.body, lint: out.lint });
      setDirty(false);
    } catch (err) {
      toast(err.data?.issues?.[0]?.message || err.message, "error");
    } finally {
      setGenerating(false);
    }
  }

  async function refine(action) {
    setRefining(action);
    try {
      const out = await api("/api/studio/refine", { method: "POST", body: { subject: draft.subject, body: draft.body, action } });
      setDraft({ subject: out.subject, body: out.body, lint: null });
      setDirty(true);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setRefining(null);
    }
  }

  function requestSend() {
    send.start({
      toEmail: form.toEmail.trim(), toName: form.toName.trim(), subject: draft.subject, body: draft.body, attachCv, kind: "studio",
    });
  }

  const connected = gmail?.account?.status === "connected";
  const toLabel = form.toName.trim() ? `${form.toName.trim()} <${form.toEmail.trim()}>` : form.toEmail.trim();

  return (
    <Page wide>
      <PageHeader
        title="Email Studio"
        description="Describe the email you need. Review and edit it, then send it from your Gmail. Nothing is sent until you confirm."
      />

      {gmail && !connected && (
        <div className="mb-5">
          <Notice
            tone="warn"
            title={gmail.account ? "Gmail needs to be reconnected" : "Gmail is not connected"}
            action={<Link href="/settings?tab=gmail" className="shrink-0 text-sm font-medium text-amber-200 underline-offset-2 hover:underline">Open settings</Link>}
          >
            You can still write and copy emails, but sending needs Gmail.
          </Notice>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="space-y-4">
          <Field label="Recipient email" error={errors.toEmail}>
            {(id) => <Input id={id} type="email" inputMode="email" autoComplete="off" placeholder="name@company.com" value={form.toEmail} onChange={set("toEmail")} />}
          </Field>
          <Field label="Recipient name" hint="Optional. Used for the greeting.">
            {(id) => <Input id={id} autoComplete="off" placeholder="Jane Doe" value={form.toName} onChange={set("toName")} />}
          </Field>
          <Field label="Email purpose" error={errors.purpose}>
            {(id) => (
              <Textarea id={id} rows={6} placeholder="What should this email say?" value={form.purpose} onChange={set("purpose")} />
            )}
          </Field>
          <div className="-mt-1 flex flex-wrap gap-1.5">
            {["Join engineering team", "Thank a recruiter", "Request a meeting"].map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setForm((f) => ({ ...f, purpose: EXAMPLES[i] }))}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
              >
                {label}
              </button>
            ))}
          </div>

          <Field label="Tone">
            {(id) => (
              <>
                <div role="radiogroup" aria-label="Tone" className="flex flex-wrap gap-1.5">
                  {TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={form.tone === t}
                      onClick={() => setForm((f) => ({ ...f, tone: t }))}
                      className={cx(
                        "rounded-md border px-2.5 py-1.5 text-[13px] font-medium capitalize transition-colors",
                        form.tone === t
                          ? "border-[rgba(77,141,255,0.5)] bg-[rgba(77,141,255,0.14)] text-white"
                          : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <span id={id} hidden />
              </>
            )}
          </Field>

          <Field label="Additional instructions" hint="Optional extra context or constraints.">
            {(id) => <Textarea id={id} rows={3} placeholder="e.g. Keep it under 100 words. Mention I can start in January." value={form.extra} onChange={set("extra")} />}
          </Field>

          <Button variant="primary" icon={Sparkles} className="w-full" loading={generating} onClick={generate}>
            {draft ? "Generate again" : "Generate email"}
          </Button>
        </Card>

        <div className="min-w-0">
          {draft ? (
            <div className="space-y-3">
              {sentTo && (
                <Notice tone="success" title={`Sent to ${sentTo}`} action={<Link href="/sent" className="shrink-0 text-sm font-medium text-emerald-200 underline-offset-2 hover:underline">View in Sent Emails</Link>}>
                  It is saved in Sent Emails. Edit it to send a different version.
                </Notice>
              )}
              <EmailEditor
                subject={draft.subject}
                body={draft.body}
                lint={draft.lint}
                toLabel={toLabel}
                refining={refining}
                regenerating={generating}
                onRefine={refine}
                onRegenerate={generate}
                onChange={(v) => {
                  setDraft((d) => ({ ...d, ...v }));
                  setDirty(true);
                }}
                onSend={requestSend}
                sendLabel="Send email"
                sending={send.preparing}
              >
                <Toggle checked={attachCv} onChange={setAttachCv} label="Attach CV" />
              </EmailEditor>
              <p className="text-xs text-zinc-600">Clicking Send opens a final confirmation. The email only goes out when you confirm there.</p>
            </div>
          ) : (
            <Card padded={false} className="min-h-[360px]">
              <Empty icon={PenLine} title="Your email will appear here">
                Fill in the recipient and what you want to say, then generate. You can edit everything before sending.
              </Empty>
            </Card>
          )}
        </div>
      </div>
      {send.dialog}
    </Page>
  );
}
