// src/server/settings.js
import { one, query } from "./db.js";
import { decrypt, encrypt } from "./crypto.js";
import { merge } from "./util.js";

export const DEFAULTS = {
  ai: {
    provider: "gemini",
    model: "gemini-2.5-flash",
    baseUrl: "",
    personalization: "",
    defaultTone: "professional",
  },
  career: {
    titles: ["Full-Stack Engineer", "Frontend Engineer", "Backend Engineer", "Software Engineer"],
    remote: true,
    international: true,
    internships: true,
    graduate: true,
    entryLevel: true,
    contract: false,
    countries: [],
    industries: ["Fintech", "Developer tools", "SaaS"],
    minSalary: null,
    avoidCompanies: [],
  },
  safety: {
    autoSendEnabled: false,
    dailyHardCap: 100,
    maxPerHour: 10,
    minIntervalSec: 90,
    sendWindow: { startHour: 8, endHour: 18, timezone: "Africa/Lagos" },
    warmup: true,
    attachCvDefault: true,
    optOutLine: true,
    followUpDays: 5,
    maxFollowUps: 1,
  },
  cv: {
    sourceUrl: "",
    cacheMinutes: 60,
    autoAttach: true,
  },
  app: {
    inboxBadge: true,
  },
};

export async function getSetting(key) {
  const row = await one("select value from app_settings where key = $1", [key]);
  return merge(DEFAULTS[key] ?? {}, row?.value);
}

export async function setSetting(key, value) {
  await query(
    `insert into app_settings (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getRaw(key) {
  const row = await one("select value from app_settings where key = $1", [key]);
  return row?.value ?? null;
}

export async function setSecret(name, value) {
  await query(
    `insert into secrets (name, ciphertext, updated_at) values ($1, $2, now())
     on conflict (name) do update set ciphertext = excluded.ciphertext, updated_at = now()`,
    [name, encrypt(value)],
  );
}

export async function getSecret(name) {
  const row = await one("select ciphertext from secrets where name = $1", [name]);
  if (!row) return null;
  try {
    return decrypt(row.ciphertext);
  } catch (err) {
    console.error(`[secrets] could not decrypt "${name}": ${err.message}`);
    return null;
  }
}

export async function hasSecret(name) {
  return Boolean(await one("select 1 as x from secrets where name = $1", [name]));
}

export async function deleteSecret(name) {
  await query("delete from secrets where name = $1", [name]);
}
