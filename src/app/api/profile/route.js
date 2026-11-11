// src/app/api/profile/route.js
import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getProfile, saveProfile } from "@/server/profile";

const s = (max) => z.string().trim().max(max);

const schema = z.object({
  name: s(80).min(1),
  professionalName: s(80),
  email: z.string().trim().email().max(254),
  portfolio: s(200),
  github: s(200),
  linkedin: s(200),
  headline: s(120),
  summary: s(1500),
  yearsExperience: z.number().min(0).max(60),
  skills: z.array(s(40).min(1)).max(60),
  experience: z.array(z.object({ title: s(120), org: s(120), period: s(60), bullets: z.array(s(400)).max(8) })).max(20),
  education: z.array(z.object({ institution: s(120), program: s(120), status: s(60) })).max(10),
  projects: z.array(z.object({ name: s(80), description: s(400), stack: s(120), url: s(200) })).max(20),
  signature: s(500),
});

export const GET = api(async () => json({ profile: await getProfile() }));

export const PUT = api(async (request) => {
  const current = await getProfile();
  const next = schema.parse(await readJson(request));
  await saveProfile({ ...current, ...next });
  return json({ ok: true, profile: await getProfile() });
});
