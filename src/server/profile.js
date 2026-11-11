// src/server/profile.js
import { one, query } from "./db.js";
import { hostFromUrl } from "./util.js";

// Seed profile. Source of truth: the owner's brief plus what is published on modred.dev
// (fetched 2026-11-09). Nothing here is invented; the owner can edit all of it in Settings.
export const DEFAULT_PROFILE = {
  name: "Favour Omirin",
  professionalName: "Modred",
  email: "favourdomirin@gmail.com",
  portfolio: "https://modred.dev",
  github: "https://github.com/Modred14",
  linkedin: "https://ng.linkedin.com/in/omirin-favour",
  headline: "Full-stack software engineer",
  summary:
    "Software Engineering student at Obafemi Awolowo University with 3+ years of experience building web applications and backend systems. Full-stack developer working mainly with Next.js, React, TypeScript, Node.js, Express and PostgreSQL. Builds database-driven applications and REST APIs, and has independently built, deployed and maintained complete products in production.",
  yearsExperience: 3,
  skills: [
    "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express", "PostgreSQL",
    "MongoDB", "Python", "HTML5", "CSS3", "Tailwind CSS", "Git", "Three.js",
  ],
  experience: [
    {
      title: "Co-Founder",
      org: "Nepogames",
      period: "June 2026 – Present",
      bullets: [
        "Co-founded a secure game account marketplace to reduce peer-to-peer scams.",
        "Built the full platform solo: escrow payments, a 30-minute buyer verification window, auto-release logic and a dispute system.",
        "Built an in-app wallet with Paystack integration and real-time seller chat.",
      ],
    },
    {
      title: "Frontend Engineer (Internship)",
      org: "2Thirty Integrated Services Ltd",
      period: "January 2024 – June 2024",
      bullets: [
        "Built and maintained web apps with React, JavaScript and Tailwind CSS.",
        "Integrated frontend components with backend APIs and built reusable UI components.",
      ],
    },
    {
      title: "First Place Winner (Contributor)",
      org: "Techfest 5.0 Hackathon",
      period: "May 2026",
      bullets: [
        "Part of a 5-member team that won first place building TapPay, a payment app with NFC tap-to-pay, QR scanning and phone-number transfers, shipped on mobile and web in 32 hours.",
      ],
    },
    {
      title: "Website & Social Media Manager",
      org: "Faith Standard Schools",
      period: "May 2026 – Present",
      bullets: ["Maintains the school's official website and manages its social media."],
    },
  ],
  education: [
    {
      institution: "Obafemi Awolowo University",
      program: "Software Engineering",
      status: "Current student",
    },
  ],
  projects: [
    {
      name: "LifeinOAU",
      description: "A multiplayer life-simulation game on a 3D map of the OAU campus.",
      stack: "Next.js, React, JavaScript, Three.js",
      url: "https://lifeinoau.com",
    },
    {
      name: "Nepogames",
      description: "A game account marketplace with escrow payments, seller chat and disputes.",
      stack: "Next.js, JavaScript, Node.js, PostgreSQL",
      url: "https://nepogames.com",
    },
    {
      name: "TapPay",
      description: "A digital payment app with NFC tap-to-pay, QR scanning and phone transfers. First place at Techfest 5.0.",
      stack: "Next.js, TypeScript, Tailwind CSS",
      url: "https://app-tappay.netlify.app",
    },
    {
      name: "Nexopra",
      description: "A WhatsApp bot that delivers curated tech jobs, hackathons and fellowships.",
      stack: "Node.js, Baileys, Groq AI",
      url: "https://nexopra.modred.dev",
    },
  ],
  signature: "Favour Omirin\nSoftware Engineer\nhttps://modred.dev",
  syncedAt: null,
};

export async function getProfile() {
  const row = await one("select data from profile where id = 1");
  if (row) return { ...DEFAULT_PROFILE, ...row.data };
  await query("insert into profile (id, data) values (1, $1::jsonb) on conflict do nothing", [
    JSON.stringify(DEFAULT_PROFILE),
  ]);
  return DEFAULT_PROFILE;
}

export async function saveProfile(data) {
  await query(
    `insert into profile (id, data, updated_at) values (1, $1::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [JSON.stringify(data)],
  );
  return data;
}

// Plain-text rendering used inside AI prompts. This (plus the CV) is the model's only source of truth.
export function profileForPrompt(p) {
  const lines = [
    `Name: ${p.name}${p.professionalName ? ` (goes by ${p.professionalName})` : ""}`,
    `Headline: ${p.headline}`,
    `Years of professional experience: ${p.yearsExperience}`,
    `Summary: ${p.summary}`,
    `Skills: ${p.skills.join(", ")}`,
    "Experience:",
    ...p.experience.map((e) => `- ${e.title}, ${e.org} (${e.period}): ${e.bullets.join(" ")}`),
    "Education:",
    ...p.education.map((e) => `- ${e.program}, ${e.institution} (${e.status})`),
    "Projects:",
    ...p.projects.map((x) => `- ${x.name}: ${x.description} Stack: ${x.stack}.${x.url ? ` ${x.url}` : ""}`),
    `Portfolio: ${p.portfolio}`,
    `GitHub: ${p.github}`,
  ];
  return lines.join("\n");
}

// Hosts the AI is allowed to link to. Anything else in a draft is flagged (prompt-injection defence).
export function allowedLinkHosts(p) {
  const urls = [p.portfolio, p.github, p.linkedin, ...(p.projects || []).map((x) => x.url)];
  return new Set(urls.map((u) => (u ? hostFromUrl(u) : null)).filter(Boolean));
}
