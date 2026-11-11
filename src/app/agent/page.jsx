// src/app/agent/page.jsx
"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Search } from "lucide-react";
import Link from "next/link";
import { api, Badge, Button, Card, cx, Empty, ErrorNote, formatDateTime, Notice, Page, PageHeader, Select, Skeleton, Stat, useLoad, useToast } from "../components/ui";

function Check({ ok, warn, label, detail, href, cta }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertCircle : Circle;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon size={17} className={cx("mt-0.5 shrink-0", ok ? "text-emerald-400" : warn ? "text-amber-400" : "text-zinc-600")} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-zinc-500">{detail}</div>
      </div>
      {!ok && href && <Link href={href} className="shrink-0 text-sm font-medium text-[rgb(125,178,255)] hover:underline">{cta || "Set up"}</Link>}
    </li>
  );
}

export default function AgentPage() {
  const { toast } = useToast();
  const status = useLoad("/api/agent/discover");
  const settings = useLoad("/api/settings");
  const gmail = useLoad("/api/gmail/status");
  const activity = useLoad("/api/activity");
  const camps = useLoad("/api/campaigns");
  const [want, setWant] = useState(20);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const s = settings.data;
  const provider = s?.settings.ai.provider;
  const hasKey = s && (s.keys[provider]?.stored || s.keys[provider]?.env);
  const cvConfigured = Boolean(s?.settings.cv.sourceUrl);
  const connected = gmail.data?.account?.status === "connected";
  const counts = status.data?.counts;
  const activeCampaigns = (camps.data?.campaigns || []).filter((c) => c.status === "active").length;
  const ready = hasKey && connected;

  async function discover() {
    setBusy(true);
    setResult(null);
    try {
      const out = await api("/api/agent/discover", { method: "POST", body: { want } });
      setResult(out);
      toast(out.created ? `${out.created} new ${out.created === 1 ? "company" : "companies"} added` : "No new companies this time", out.created ? "success" : "info");
      status.reload(); activity.reload();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  return (
    <Page wide>
      <PageHeader title="AI Career Agent" description="Finds companies from real job listings, researches their own websites, looks for published recruitment contacts and drafts one personalised email each." />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Discovered" value={counts?.discovered ?? 0} loading={status.loading && !counts} hint="Awaiting research" />
            <Stat label="Researched" value={counts?.researched ?? 0} loading={status.loading && !counts} />
            <Stat label="Ready to email" value={counts?.ready ?? 0} loading={status.loading && !counts} />
            <Stat label="Active campaigns" value={activeCampaigns} loading={camps.loading && !camps.data} />
          </div>

          <Card>
            <h2 className="text-sm font-semibold text-white">Find companies now</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">Uses your career preferences from Settings. Sources are the Remotive and Arbeitnow job boards{status.data?.searchCapability ? " plus web search" : ""}. Each company is deduplicated against what you already have.</p>
            {status.data && !status.data.searchCapability && (
              <div className="mt-3"><Notice tone="info">Job boards publish company names but not websites. Add a Gemini or Brave Search key in Settings → AI so Atlas can confirm each company&apos;s real website. Without one, companies are saved but cannot be researched automatically.</Notice></div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Select aria-label="How many companies" value={want} onChange={(e) => setWant(Number(e.target.value))} className="w-40">
                {[10, 20, 40, 60].map((n) => <option key={n} value={n}>Up to {n}</option>)}
              </Select>
              <Button variant="primary" icon={Search} loading={busy} onClick={discover}>{busy ? "Searching…" : "Discover companies"}</Button>
              <Link href="/settings?tab=career" className="text-sm text-zinc-500 hover:text-zinc-300">Edit preferences</Link>
            </div>
            {result && (
              <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4 text-sm">
                <p className="text-zinc-300">{result.created} new {result.created === 1 ? "company" : "companies"} saved. {result.queuedResearch} queued for research.</p>
                {result.failedSources?.length > 0 && <Notice tone="warn" title="Some sources failed"><ul className="list-disc pl-4">{result.failedSources.map((f) => <li key={f}>{f}</li>)}</ul></Notice>}
                <p className="text-xs text-zinc-600">Research runs in the background every few minutes. Open <Link href="/companies" className="text-[rgb(125,178,255)] hover:underline">Companies</Link> to follow progress.</p>
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-white">Recent activity</h2>
              {status.data?.jobs && <span className="text-xs text-zinc-600">{status.data.jobs.queued} queued · {status.data.jobs.failed} failed</span>}
            </div>
            {activity.error ? <div className="p-4"><ErrorNote error={activity.error} onRetry={activity.reload} /></div>
              : activity.loading && !activity.data ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
              : !activity.data?.events.length ? <Empty title="No activity yet">Discovery, research, sends and errors are logged here.</Empty>
              : (
                <ul className="max-h-[420px] divide-y divide-white/[0.05] overflow-y-auto">
                  {activity.data.events.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm sm:px-5">
                      <Badge tone={e.level === "error" ? "red" : e.level === "warn" ? "amber" : "neutral"}>{e.level}</Badge>
                      <div className="min-w-0 flex-1"><div className="text-zinc-300">{e.event.replaceAll("_", " ")}</div>{e.data?.message && <div className="mt-0.5 break-words text-xs text-zinc-500">{e.data.message}</div>}</div>
                      <span className="shrink-0 text-xs text-zinc-600">{formatDateTime(e.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </div>

        <Card className="lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold text-white">Readiness</h2>
          <p className="mt-0.5 text-xs text-zinc-600">Live status of what the agent needs.</p>
          {settings.loading && !s ? <div className="mt-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <ul className="mt-2 divide-y divide-white/[0.06]">
              <Check ok={hasKey} label="AI provider" detail={hasKey ? `${s.providers[provider].label}, model ${s.settings.ai.model || s.providers[provider].defaultModel}` : "Add an API key to write and research."} href="/settings?tab=ai" />
              <Check ok={connected} warn={gmail.data?.account && !connected} label="Gmail" detail={connected ? gmail.data.account.email : gmail.data?.configured === false ? "Google OAuth credentials are not set on the server yet." : "Connect to send emails and read replies."} href="/settings?tab=gmail" cta="Connect" />
              <Check ok={cvConfigured || s?.cvSync?.ok} label="CV source" detail={cvConfigured ? "Fetched automatically from your CV generator." : "Point Atlas at your CV generator, or upload a PDF."} href="/settings?tab=documents" />
              <Check ok={Boolean(s?.searchCapability)} label="Website lookup" detail={s?.searchCapability === "brave" ? "Brave Search" : s?.searchCapability === "gemini" ? "Gemini with Google Search" : "Needed to confirm company websites."} href="/settings?tab=ai" />
            </ul>
          )}
          {s && !ready && <div className="mt-3"><Notice tone="warn">Finish the items above before starting a campaign.</Notice></div>}
          <div className="mt-4 border-t border-white/[0.07] pt-4"><Link href="/campaigns" className="text-sm font-medium text-[rgb(125,178,255)] hover:underline">Manage campaigns</Link></div>
        </Card>
      </div>
    </Page>
  );
}
