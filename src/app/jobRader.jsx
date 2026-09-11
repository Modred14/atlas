"use client";

import { useEffect, useState } from "react";
import { Search, Plus, X, ExternalLink, Clock3, Sparkles } from "lucide-react";
import GlassPanel from "@/components/GlassPanel";
import AnimatedNumber from "@/components/AnimatedNumber";

const ACCENT = "77,141,255";

const DEFAULT_SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Tailwind CSS",
];

const SEEN_KEY = "jobRadarSeenIds";
const SKILLS_KEY = "jobRadarSkills";

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diffMs / 3600000);
  if (hrs < 1) return "just posted";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function locationTags(locationStr = "") {
  const s = locationStr.toLowerCase();
  const tags = [];
  const worldwide = /worldwide|anywhere|global/.test(s);
  if (worldwide || s.includes("nigeria") || s.includes("africa")) tags.push("Nigeria");
  if (worldwide || s.includes("usa") || s.includes("united states") || /\bus\b/.test(s)) tags.push("USA");
  return tags;
}

async function fetchRemotive(query) {
  const res = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Remotive request failed");
  const data = await res.json();
  return (data.jobs || []).map((j) => ({
    id: `remotive-${j.id}`,
    title: j.title,
    company: j.company_name,
    url: j.url,
    location: j.candidate_required_location || "",
    tags: j.tags || [],
    postedAt: j.publication_date,
    source: "Remotive",
  }));
}

async function fetchArbeitnow() {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
  if (!res.ok) throw new Error("Arbeitnow request failed");
  const data = await res.json();
  return (data.data || [])
    .filter((j) => j.remote && /full[- ]?stack|front[- ]?end/i.test(j.title))
    .map((j) => ({
      id: `arbeitnow-${j.slug}`,
      title: j.title,
      company: j.company_name,
      url: j.url,
      location: j.location || "Worldwide",
      tags: j.tags || [],
      postedAt: new Date(j.created_at * 1000).toISOString(),
      source: "Arbeitnow",
    }));
}

function scoreJob(job, skills) {
  const haystack = `${job.title} ${job.tags.join(" ")}`.toLowerCase();
  return skills.filter((s) => haystack.includes(s.toLowerCase())).length;
}

/**
 * Single shared hook — call it ONCE in the parent (Home) and pass the
 * returned object as `radar` into both <JobRadarControls> and
 * <JobRadarResults>. That's what keeps "Search Now" on one card in sync
 * with the results list living in a different card elsewhere on the page.
 */
export function useJobRadar(initialSkills = DEFAULT_SKILLS) {
  const [skills, setSkills] = useState(initialSkills);
  const [skillInput, setSkillInput] = useState("");
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done
  const [failedSources, setFailedSources] = useState([]);
  const [lastRun, setLastRun] = useState(null);

  useEffect(() => {
    const storedSkills = localStorage.getItem(SKILLS_KEY);
    if (storedSkills) {
      try {
        setSkills(JSON.parse(storedSkills));
      } catch {}
    }
  }, []);

  function addSkill(raw) {
    const val = raw.trim();
    if (!val || skills.includes(val)) return;
    const next = [...skills, val];
    setSkills(next);
    localStorage.setItem(SKILLS_KEY, JSON.stringify(next));
  }

  function removeSkill(s) {
    const next = skills.filter((x) => x !== s);
    setSkills(next);
    localStorage.setItem(SKILLS_KEY, JSON.stringify(next));
  }

  async function runSearch() {
    setStatus("loading");
    setFailedSources([]);

    const seenIds = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));

    const tasks = [
      fetchRemotive("full stack developer"),
      fetchRemotive("frontend developer"),
      fetchArbeitnow(),
    ];

    const results = await Promise.allSettled(tasks);
    const failed = [];
    let all = [];

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        all = all.concat(r.value);
      } else {
        failed.push(["Remotive (full stack)", "Remotive (frontend)", "Arbeitnow"][i]);
      }
    });

    setFailedSources(failed);

    const ranked = all
      .map((j) => ({ ...j, tagsLoc: locationTags(j.location) }))
      .filter((j) => j.tagsLoc.length > 0 && !seenIds.has(j.id))
      .map((j) => ({ ...j, matchScore: scoreJob(j, skills) }))
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return new Date(b.postedAt) - new Date(a.postedAt);
      })
      .slice(0, 5);

    const seenUrls = new Set();
    const finalJobs = [];
    for (const j of ranked) {
      if (seenUrls.has(j.url)) continue;
      seenUrls.add(j.url);
      finalJobs.push(j);
    }

    finalJobs.forEach((j) => seenIds.add(j.id));
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seenIds).slice(-500)));

    setJobs(finalJobs);
    setLastRun(new Date());
    setStatus("done");
  }

  return {
    skills,
    skillInput,
    setSkillInput,
    addSkill,
    removeSkill,
    jobs,
    status,
    failedSources,
    lastRun,
    runSearch,
  };
}

/** Left/right card: title, status pill, search button, skill chips. */
export function JobRadarControls({ radar, mounted, delay = 0 }) {
  const { skills, skillInput, setSkillInput, addSkill, removeSkill, status, runSearch } = radar;
  const isLoading = status === "loading";

  return (
    <GlassPanel mounted={mounted} delay={delay}>
      <div
        className="glow-blob"
        style={{ background: `radial-gradient(circle, rgba(${ACCENT},0.22), transparent 70%)` }}
      />

      <div className="relative">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-300">Job Radar</h3>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: isLoading ? `rgba(${ACCENT},0.12)` : "rgba(255,255,255,0.05)",
              color: isLoading ? `rgb(${ACCENT})` : "rgb(113,113,122)",
            }}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isLoading ? "pulse-dot" : ""}`}
              style={{ background: isLoading ? `rgb(${ACCENT})` : "rgb(113,113,122)" }}
            />
            {isLoading ? "Scanning" : "Standby"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-600">Full Stack &amp; Frontend · Remote (Nigeria / USA)</p>

        <button
          onClick={runSearch}
          disabled={isLoading}
          className="radar-btn mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed"
          style={{
            background: isLoading
              ? "rgba(255,255,255,0.06)"
              : `linear-gradient(135deg, rgb(${ACCENT}), rgba(140,120,255,1))`,
            boxShadow: isLoading ? "none" : `0 10px 24px -8px rgba(${ACCENT},0.45)`,
          }}
        >
          {isLoading ? (
            <>
              <span className="radar-sweep" />
              <span className="text-zinc-300">Searching the boards…</span>
            </>
          ) : (
            <>
              <Search size={16} strokeWidth={2.4} />
              Search Now
            </>
          )}
        </button>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1.5 text-xs font-medium text-zinc-300"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {s}
              <button
                onClick={() => removeSkill(s)}
                className="rounded-full p-0.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <div
            className="flex items-center gap-1 rounded-full py-1 pl-2 pr-2.5 text-xs"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.14)" }}
          >
            <Plus size={11} className="text-zinc-600" />
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addSkill(skillInput);
                  setSkillInput("");
                }
              }}
              placeholder="Add skill"
              className="w-20 bg-transparent text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <style jsx>{`
        .glow-blob {
          position: absolute;
          top: -100px;
          left: -60px;
          width: 260px;
          height: 260px;
          border-radius: 9999px;
          filter: blur(60px);
          pointer-events: none;
        }
        .pulse-dot {
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(${ACCENT}, 0.5); }
          50% { box-shadow: 0 0 0 4px rgba(${ACCENT}, 0); }
        }
        .radar-sweep {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          border: 2px solid rgba(255, 255, 255, 0.15);
          border-top-color: rgb(${ACCENT});
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .radar-sweep, .pulse-dot { animation: none !important; }
        }
      `}</style>
    </GlassPanel>
  );
}

/** Full-width strip: results list, empty state, disclaimer, last-run time. */
export function JobRadarResults({ radar, mounted, delay = 0 }) {
  const { jobs, status, failedSources, lastRun } = radar;
  const isLoading = status === "loading";

  return (
    <GlassPanel mounted={mounted} delay={delay}>
      <div className="relative">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm text-zinc-400">Matches</h3>
          {status === "done" && (
            <div className="text-right">
              <span className="font-mono text-2xl font-bold text-white tabular-nums">
                <AnimatedNumber value={jobs.length} />
              </span>
              <span className="ml-1.5 text-[11px] text-zinc-600">new</span>
            </div>
          )}
        </div>

        {failedSources.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-400/80">
            Couldn't reach: {failedSources.join(", ")}. Other sources still shown.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shimmer h-[84px] rounded-xl" style={{ animationDelay: `${i * 100}ms` }} />
            ))}

          {status === "done" && jobs.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-2 py-8 text-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <Sparkles size={16} className="text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500">No new matching roles right now.</p>
              <p className="text-xs text-zinc-700">You've already seen everything currently posted — check back later.</p>
            </div>
          )}

          {status === "idle" && (
            <div className="col-span-full flex flex-col items-center gap-2 py-10 text-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <Search size={16} className="text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500">Hit Search Now to scan the boards.</p>
            </div>
          )}

          {jobs.map((j, i) => (
            <a
              key={j.id}
              href={j.url}
              target="_blank"
              rel="noopener noreferrer"
              className="job-card group relative flex items-start justify-between gap-3 overflow-hidden rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.035]"
              style={{ border: "1px solid rgba(255,255,255,0.08)", animationDelay: `${i * 70}ms` }}
            >
              {i === 0 && (
                <span
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ background: `linear-gradient(180deg, rgb(${ACCENT}), rgba(140,120,255,1))` }}
                />
              )}

              <div className="min-w-0">
                {i === 0 && (
                  <span
                    className="mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: `rgba(${ACCENT},0.14)`, color: `rgb(${ACCENT})` }}
                  >
                    <Sparkles size={10} /> Top match
                  </span>
                )}
                <div className="truncate font-semibold text-white group-hover:underline">{j.title}</div>
                <div className="truncate text-sm text-zinc-500">{j.company}</div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {j.tagsLoc.map((t) => (
                    <span
                      key={t}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: `rgba(${ACCENT},0.12)`, color: `rgb(${ACCENT})` }}
                    >
                      {t}
                    </span>
                  ))}
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-500" style={{ background: "rgba(255,255,255,0.05)" }}>
                    {j.source}
                  </span>
                  {j.matchScore > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-emerald-300" style={{ background: "rgba(52,211,153,0.1)" }}>
                      {j.matchScore} skill match{j.matchScore > 1 ? "es" : ""}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="whitespace-nowrap text-[11px] text-zinc-600">{timeAgo(j.postedAt)}</span>
                <ExternalLink size={14} className="text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </a>
          ))}
        </div>

        {lastRun && (
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-zinc-600">
            <Clock3 size={12} /> Last searched {lastRun.toLocaleTimeString()}
          </p>
        )}
        <p className="mt-2 text-[11px] text-zinc-700">
          No board exposes real applicant counts — freshest postings rank higher as a rough low-competition proxy, not an actual count.
        </p>
      </div>

      <style jsx>{`
        .job-card {
          animation: cardIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .shimmer {
          background: linear-gradient(100deg, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 70%);
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .job-card, .shimmer { animation: none !important; }
        }
      `}</style>
    </GlassPanel>
  );
}