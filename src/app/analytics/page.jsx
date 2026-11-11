// src/app/analytics/page.jsx
"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CATEGORY_LABEL, Empty, ErrorNote, Page, PageHeader, Select, Skeleton, Stat, useLoad } from "../components/ui";

const BLUE = "rgb(77,141,255)";
const GREEN = "rgb(52,211,153)";

function DailyChart({ daily }) {
  const W = 720, H = 220, PL = 34, PB = 24, PT = 10, PR = 8;
  const max = Math.max(4, ...daily.flatMap((d) => [d.sent, d.replies]));
  const nice = Math.ceil(max / 4) * 4;
  const bw = (W - PL - PR) / daily.length;
  const y = (v) => PT + (H - PT - PB) * (1 - v / nice);
  const step = Math.ceil(daily.length / 7);
  const [hover, setHover] = useState(null);
  const h = hover != null ? daily[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Emails sent and replies per day" className="h-auto w-full">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (nice / 4) * i;
          return <g key={i}><line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" /><text x={PL - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#71717a">{v}</text></g>;
        })}
        {daily.map((d, i) => {
          const x = PL + i * bw;
          const w = Math.max(2, bw * 0.34);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={PT} width={bw} height={H - PT - PB} fill="transparent" />
              <rect x={x + bw * 0.12} y={y(d.sent)} width={w} height={H - PB - y(d.sent)} rx="1.5" fill={BLUE} opacity={hover == null || hover === i ? 1 : 0.5} />
              <rect x={x + bw * 0.12 + w + 1} y={y(d.replies)} width={w} height={H - PB - y(d.replies)} rx="1.5" fill={GREEN} opacity={hover == null || hover === i ? 1 : 0.5} />
              {i % step === 0 && <text x={x + bw / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="#71717a">{d.day.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-md border border-white/10 bg-[#141418] px-2.5 py-1.5 text-xs text-zinc-300 shadow-lg">
          <div className="font-medium text-white">{h.day}</div>
          <div><span style={{ color: BLUE }}>●</span> {h.sent} sent</div>
          <div><span style={{ color: GREEN }}>●</span> {h.replies} replies</div>
        </div>
      )}
      <div className="mt-2 flex gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: BLUE }} />Sent</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: GREEN }} />Replies</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useLoad(`/api/analytics?days=${days}`);
  const t = data?.totals;
  const hasActivity = data && (Number(t.sent) > 0 || Number(t.companies) > 0 || data.daily.some((d) => d.sent || d.replies));
  const n = (v) => Number(v ?? 0).toLocaleString();
  const maxCat = Math.max(1, ...(data?.categories || []).map((c) => Number(c.n)));

  return (
    <Page wide>
      <PageHeader
        title="Analytics"
        description="Everything here is counted from your own records. Nothing is estimated."
        actions={<Select aria-label="Date range" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select>}
      />
      {error && <ErrorNote error={error} onRetry={reload} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Companies discovered" value={n(t?.companies)} loading={loading && !t} />
        <Stat label="Verified contacts" value={n(t?.verified_contacts)} loading={loading && !t} hint={t ? `At ${n(t.verified_companies)} companies` : null} />
        <Stat label="Emails generated" value={n(t?.generated)} loading={loading && !t} hint="Campaign drafts" />
        <Stat label="Emails sent" value={n(t?.sent)} loading={loading && !t} />
        <Stat label="Sent, no bounce" value={n(t?.delivered)} loading={loading && !t} />
        <Stat label="Bounced" value={n(t?.bounced)} loading={loading && !t} hint={t ? `${n(t.failed)} failed to send` : null} />
        <Stat label="Replies" value={n(t?.replies)} loading={loading && !t} hint="Companies that replied" />
        <Stat label="Response rate" value={t ? (t.responseRate == null ? "—" : `${t.responseRate}%`) : ""} loading={loading && !t} hint="Of companies contacted" />
        <Stat label="Positive responses" value={n(t?.positive)} loading={loading && !t} />
        <Stat label="Interview invitations" value={n(t?.interviews)} loading={loading && !t} />
        <Stat label="Rejections" value={n(t?.rejections)} loading={loading && !t} />
        <Stat label="Suppressed addresses" value={n(t?.suppressed)} loading={loading && !t} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-white">Daily outreach activity</h2>
          {loading && !data ? <Skeleton className="h-56 w-full" /> : !hasActivity ? <Empty icon={BarChart3} title="No activity yet">Charts fill in as you send emails and receive replies.</Empty> : <DailyChart daily={data.daily} />}
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-white">Replies by type</h2>
          {loading && !data ? <Skeleton className="h-40 w-full" /> : !data?.categories.length ? <p className="py-8 text-center text-sm text-zinc-500">No replies yet.</p> : (
            <ul className="space-y-3">
              {data.categories.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-zinc-300">{CATEGORY_LABEL[c.category] || c.category}</span><span className="tabular-nums text-zinc-500">{c.n}</span></div>
                  <div className="h-1.5 rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${(Number(c.n) / maxCat) * 100}%`, background: BLUE }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card padded={false} className="mt-5 overflow-hidden">
        <div className="border-b border-white/[0.07] px-4 py-3 sm:px-5"><h2 className="text-sm font-semibold text-white">Campaign performance</h2></div>
        {loading && !data ? <div className="p-4"><Skeleton className="h-20 w-full" /></div> : !data?.campaigns.length ? <p className="px-5 py-8 text-center text-sm text-zinc-500">No campaigns yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="border-b border-white/[0.07] text-left text-xs text-zinc-500"><th className="px-4 py-2.5 font-medium sm:px-5">Campaign</th><th className="px-3 py-2.5 text-right font-medium">Sent</th><th className="px-3 py-2.5 text-right font-medium">Bounced</th><th className="px-3 py-2.5 text-right font-medium">Replies</th><th className="px-4 py-2.5 text-right font-medium sm:px-5">Reply rate</th></tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.campaigns.map((c) => (
                  <tr key={c.id}><td className="px-4 py-3 text-zinc-200 sm:px-5">{c.name}</td><td className="px-3 py-3 text-right tabular-nums text-zinc-400">{c.sent}</td><td className="px-3 py-3 text-right tabular-nums text-zinc-400">{c.bounced}</td><td className="px-3 py-3 text-right tabular-nums text-zinc-400">{c.replies}</td><td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">{Number(c.sent) ? `${Math.round((Number(c.replies) / Number(c.sent)) * 1000) / 10}%` : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data && <p className="mt-4 text-xs text-zinc-600">Days are in {data.timezone}. “Sent, no bounce” means Gmail accepted the message and no bounce notice has arrived.</p>}
    </Page>
  );
}
