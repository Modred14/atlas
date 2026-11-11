// src/app/settings/page.jsx
"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ErrorNote, Page, PageHeader, Skeleton, Tabs, useLoad } from "../components/ui";
import { AiSection, AppSection, CampaignSection, CareerSection, DocumentsSection, GmailSection, ProfileSection } from "./sections";

const TABS = [
  { id: "ai", label: "AI" },
  { id: "career", label: "Career preferences" },
  { id: "gmail", label: "Gmail" },
  { id: "profile", label: "Professional profile" },
  { id: "documents", label: "CV & documents" },
  { id: "campaigns", label: "Campaigns" },
  { id: "app", label: "Application" },
];

function SettingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "ai";
  const settings = useLoad("/api/settings");
  const profile = useLoad("/api/profile");

  const setTab = useCallback((id) => router.replace(`/settings?tab=${id}`, { scroll: false }), [router]);
  const err = settings.error || profile.error;
  const ready = settings.data && profile.data;

  return (
    <Page>
      <PageHeader title="Settings" description="Configure the AI, your profile, Gmail and how campaigns behave." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-6">
        {err ? <ErrorNote error={err} onRetry={() => { settings.reload(); profile.reload(); }} /> : !ready ? (
          <div className="space-y-4"><Skeleton className="h-10 w-full max-w-md" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <>
            {tab === "ai" && <AiSection data={settings.data} reload={settings.reload} />}
            {tab === "career" && <CareerSection data={settings.data} reload={settings.reload} />}
            {tab === "gmail" && <GmailSection data={settings.data} params={params} />}
            {tab === "profile" && <ProfileSection profile={profile.data.profile} reload={profile.reload} />}
            {tab === "documents" && <DocumentsSection data={settings.data} profile={profile.data.profile} reloadSettings={settings.reload} reloadProfile={profile.reload} />}
            {tab === "campaigns" && <CampaignSection data={settings.data} reload={settings.reload} />}
            {tab === "app" && <AppSection data={settings.data} reload={settings.reload} />}
          </>
        )}
      </div>
    </Page>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}
