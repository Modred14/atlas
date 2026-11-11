// src/app/api/settings/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { DEFAULTS, getRaw, getSetting, hasSecret, setSetting } from "@/server/settings";
import { PROVIDERS } from "@/server/ai";
import { searchCapability } from "@/server/discovery";

const str = z.string().trim();
const list = z.array(str.min(1).max(80)).max(60);

const schemas = {
  ai: z.object({
    provider: z.enum(Object.keys(PROVIDERS)),
    model: str.max(120),
    baseUrl: str.max(300),
    personalization: str.max(2000),
    defaultTone: z.enum(["professional", "friendly", "formal", "persuasive", "casual", "concise", "confident"]),
  }),
  career: z.object({
    titles: list,
    remote: z.boolean(),
    international: z.boolean(),
    internships: z.boolean(),
    graduate: z.boolean(),
    entryLevel: z.boolean(),
    contract: z.boolean(),
    countries: list,
    industries: list,
    minSalary: z.number().int().min(0).max(10_000_000).nullable(),
    avoidCompanies: list,
  }),
  safety: z.object({
    autoSendEnabled: z.boolean(),
    dailyHardCap: z.number().int().min(1).max(100),
    maxPerHour: z.number().int().min(1).max(60),
    minIntervalSec: z.number().int().min(30).max(3600),
    sendWindow: z.object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(1).max(24),
      timezone: str.max(60).refine((tz) => {
        try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
      }, "Unknown time zone"),
    }),
    warmup: z.boolean(),
    attachCvDefault: z.boolean(),
    optOutLine: z.boolean(),
    followUpDays: z.number().int().min(2).max(30),
    maxFollowUps: z.number().int().min(0).max(2),
  }),
  cv: z.object({
    sourceUrl: str.max(500).refine((v) => !v || /^https:\/\//i.test(v), "Use an https:// URL"),
    cacheMinutes: z.number().int().min(5).max(1440),
    autoAttach: z.boolean(),
  }),
  app: z.object({ inboxBadge: z.boolean() }),
};

export const GET = api(async () => {
  const settings = {};
  for (const key of Object.keys(DEFAULTS)) settings[key] = await getSetting(key);
  const keys = {};
  for (const [id, p] of Object.entries(PROVIDERS)) {
    keys[id] = { stored: await hasSecret(`ai_key:${id}`), env: Boolean(process.env[p.envKey]) };
  }
  return json({
    settings,
    keys,
    providers: Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, { label: p.label, defaultModel: p.defaultModel, envKey: p.envKey }])),
    braveKey: { stored: await hasSecret("search_key:brave"), env: Boolean(process.env.BRAVE_SEARCH_API_KEY) },
    searchCapability: await searchCapability(),
    cvSync: await getRaw("cv_sync"),
  });
});

export const PUT = api(async (request) => {
  const { key, value } = await readJson(request, z.object({ key: z.enum(Object.keys(schemas)), value: z.unknown() }));
  const parsed = schemas[key].parse(value);
  if (key === "safety" && parsed.sendWindow.endHour <= parsed.sendWindow.startHour) {
    return json({ error: "The sending window must end after it starts." }, { status: 400 });
  }
  await setSetting(key, parsed);
  return json({ ok: true, value: await getSetting(key) });
});
