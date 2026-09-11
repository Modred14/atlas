"use client";

import { useEffect, useRef, useState } from "react";
import { useJobRadar, JobRadarControls, JobRadarResults } from "./jobRader";
import GlassPanel from "./components/GlassPanel";
import SectionHeader from "./components/SectionHeader";
import AnimatedNumber from "./components/AnimatedNumber";
import { owner, ACCENT, MOOD, moodForClock } from "./lib/owner";

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(seconds / 60);
  const hr = Math.floor(mins / 60);
  if (hr === 0 && mins % 60 === 0) return "0m";
  if (hr === 0) return `${mins % 60}m`;
  return `${hr}h ${String(mins % 60).padStart(2, "0")}m`;
}

export default function Home() {
  const [clock, setClock] = useState("00:00:00");
  const [greeting, setGreeting] = useState("Good Morning");
  const [timeOfDay, setTimeOfDay] = useState("AM");
  const [mood, setMood] = useState("AM");
  const [date] = useState(() => new Date());

  const [todayTotal, setTodayTotal] = useState("0h 0m");
  const [weekTotal, setWeekTotal] = useState("0h 0m");
  const [streakDays, setStreakDays] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState(null);

  const [weekly, setWeekly] = useState([]);
  const [todayKey, setTodayKey] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [statsLoaded, setStatsLoaded] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const [liveMessage, setLiveMessage] = useState("");
  const radar = useJobRadar(owner.stack);

  useEffect(() => {
    const storedMessage = localStorage.getItem("adminModredMessage");
    if (storedMessage) {
      setLiveMessage(storedMessage);
    }
  }, []);

  useEffect(() => {
    setMounted(true);

    async function updateStats() {
      try {
        const [current, stats] = await Promise.all([
          fetch("https://track-vs.netlify.app/api/coding/current").then((r) =>
            r.json(),
          ),
          fetch("https://track-vs.netlify.app/api/coding/stats").then((r) =>
            r.json(),
          ),
        ]);

        setTodayTotal(formatDuration(current.todaySeconds));
        setWeekTotal(formatDuration(stats.totals?.last7Seconds));
        setStreakDays(stats.streakDays || 0);
        setIsActive(Boolean(current.active));
        setActiveLanguage(current.language || null);

        setWeekly(stats.weekly || []);
        setTodayKey(stats.todayKey || null);
        setHeatmap(stats.heatmap || []);
        setStatsLoaded(true);
      } catch (err) {
        console.error("Failed to fetch stats", err);
      }
    }

    updateStats();
    const statsInterval = setInterval(updateStats, 60000);

    const clockInterval = setInterval(() => {
      const now = new Date();
      const clockTime = now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const nextMood = moodForClock(clockTime);
      setMood(nextMood);
      setTimeOfDay(nextMood === "AM" ? "AM" : "PM");
      setGreeting(
        nextMood === "AM"
          ? "Good Morning"
          : nextMood === "PM_DAY"
            ? "Good Afternoon"
            : "Good Evening",
      );
      setClock(clockTime);
    }, 1000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const [hr, mins, secs] = clock.split(":");
  const { glow } = MOOD[mood];

  function handleMouseMove(e) {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -6, y: px * 8 });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pt-6 pb-6 sm:px-6 sm:pt-10 lg:px-10">
      {/* ===== TODAY ===== */}
      <section id="today" className="scroll-mt-6">
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={`relative overflow-hidden rounded-3xl p-6 transition-[transform,opacity] duration-700 ease-out will-change-transform sm:p-8 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
          style={{
            background:
              "linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)), #0b0b0e",
            border: "1px solid rgba(255,255,255,0.08)",
            transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transition: "transform 0.2s ease-out, opacity 0.7s ease-out",
            boxShadow: `0 24px 70px -24px rgba(0,0,0,0.6), 0 0 44px -18px rgba(${glow},0.35)`,
          }}
        >
          <div
            className="glow-blob"
            style={{
              background: `radial-gradient(circle, rgba(${glow},0.35), transparent 70%)`,
            }}
          />

          <div className="relative">
            <div className="flex items-center gap-2 text-[15px] text-zinc-300">
              <span>
                {greeting},{" "}
                <span className="font-semibold text-white">{owner.nickName}</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-500 ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-white/5 text-zinc-500"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isActive ? "pulse-dot bg-emerald-400" : "bg-zinc-500"}`}
                />
                {isActive
                  ? `Coding${activeLanguage ? ` · ${activeLanguage}` : ""}`
                  : "Idle"}
              </span>
            </div>

            <div className="mt-3 inline-flex items-start gap-2 font-mono tabular-nums">
              <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-300 sm:text-7xl lg:text-8xl">
                {hr}
                <span className="colon-blink">:</span>
                {mins}
              </div>
              <div className="grid pt-3 font-semibold sm:pt-4">
                <span className="text-[11px] tracking-tight text-zinc-500 sm:text-[13px]">
                  {timeOfDay}
                </span>
                <span
                  key={secs}
                  className="tick text-base text-zinc-300 sm:text-xl"
                >
                  {secs}
                </span>
              </div>
            </div>

            <div className="mt-1.5 text-sm text-zinc-500">
              {date.toLocaleDateString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
              <StatChip label="Today" value={todayTotal} />
                           <StatChip
                label="Current Streak"
                value={
                  <span className="inline-flex flex-wrap items-baseline gap-1">
                    <AnimatedNumber value={streakDays} className="tabular-nums" />
                    <span>{streakDays === 1 ? "day" : "days"}</span>
                    {/* <span className="flame" aria-hidden="true">
                      🔥
                    </span> */}
                  </span>
                }
                warm
              />
              <StatChip label="This Week" value={weekTotal} />
            </div>
          </div>

          <style jsx>{`
            .glow-blob {
              position: absolute;
              top: -120px;
              right: -80px;
              width: 320px;
              height: 320px;
              border-radius: 9999px;
              filter: blur(50px);
              animation: drift 22s ease-in-out infinite;
              pointer-events: none;
            }
            @keyframes drift {
              0%,
              100% {
                transform: translate(0, 0) scale(1);
              }
              50% {
                transform: translate(-24px, 18px) scale(1.08);
              }
            }
            .colon-blink {
              animation: blink 2s steps(1) infinite;
            }
            @keyframes blink {
              50% {
                opacity: 0.25;
              }
            }
            .tick {
              display: inline-block;
              animation: tick 300ms ease-out;
            }
            @keyframes tick {
              0% {
                opacity: 0.4;
                transform: translateY(2px) scale(0.94);
              }
              100% {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
            .flame {
              display: inline-block;
              animation: flicker 2.4s ease-in-out infinite;
            }
            @keyframes flicker {
              0%,
              100% {
                transform: scale(1) rotate(0deg);
              }
              50% {
                transform: scale(1.12) rotate(-4deg);
              }
            }
            .pulse-dot {
              animation: pulse 1.6s ease-in-out infinite;
            }
            @keyframes pulse {
              0%,
              100% {
                box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5);
              }
              50% {
                box-shadow: 0 0 0 4px rgba(52, 211, 153, 0);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .glow-blob,
              .colon-blink,
              .tick,
              .flame,
              .pulse-dot {
                animation: none !important;
              }
            }
          `}</style>
        </div>

        {/* Note to self lives here — a quick, always-on "today" tool */}
        <div className="mt-3">
          <NoteCard
            value={liveMessage}
            onChange={(val) => {
              setLiveMessage(val);
              localStorage.setItem("adminModredMessage", val);
            }}
            mounted={mounted}
            delay={120}
          />
        </div>
      </section>

      {/* ===== INSIGHTS ===== */}
      <section id="insights" className="scroll-mt-6">
        <SectionHeader
          eyebrow="Activity"
          title="Insights"
          description="How your coding time has trended this week and over the last few months."
        />
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
          <WeekChart
            weekly={weekly}
            todayKey={todayKey}
            loaded={statsLoaded}
            mounted={mounted}
            delay={120}
          />
          <ActivityHeatmap
            heatmap={heatmap}
            loaded={statsLoaded}
            mounted={mounted}
            delay={240}
          />
        </div>
      </section>

      {/* ===== JOB RADAR ===== */}
      <section id="radar" className="scroll-mt-6 pb-6">
        <SectionHeader
          eyebrow="Opportunities"
          title="Job Radar"
          description="Scans remote boards for roles matching your stack, filtered to Nigeria and the USA."
        />
        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2">
          <JobRadarControls radar={radar} mounted={mounted} delay={120} />
          <div
            className="hidden rounded-2xl p-6 md:flex md:flex-col md:justify-center"
            style={{
              background: "#0d0d10",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p className="text-sm leading-relaxed text-zinc-500">
              Job Radar checks Remotive and Arbeitnow for fresh full-stack and
              frontend roles, scores them against your skill chips, and
              surfaces only postings open to <span className="text-zinc-300">Nigeria</span> or the{" "}
              <span className="text-zinc-300">USA</span>. Already-seen roles
              won&apos;t show up twice.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <JobRadarResults radar={radar} mounted={mounted} delay={240} />
        </div>
      </section>
    </div>
  );
}

function StatChip({ label, value, warm = false }) {
  return (
    <div
      className={`rounded-xl px-3 py-2.5 transition-colors duration-300 ${
        warm
          ? "bg-orange-500/[0.06] border border-orange-400/20"
          : "bg-white/[0.03] border border-white/10"
      }`}
    >
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function WeekChart({ weekly, todayKey, loaded, mounted, delay }) {
  const max = Math.max(60, ...weekly.map((d) => d.seconds));
  const weekSeconds = weekly.reduce((sum, d) => sum + (d.seconds || 0), 0);

  return (
    <GlassPanel mounted={mounted} delay={delay}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm text-zinc-400">This week</h3>
        <div className="font-mono text-2xl font-bold text-white tabular-nums">
          {formatDuration(weekSeconds)}
        </div>
      </div>

      {weekly.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600">No activity yet.</p>
      ) : (
        <div className="mt-6 flex items-end gap-3 h-32">
          {weekly.map((d, i) => {
            const heightPct = Math.max(3, (d.seconds / max) * 100);
            const isToday = d.date === todayKey;
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="group relative flex h-24 w-full items-end">
                  <div
                    className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 scale-95 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-all duration-150 group-hover:scale-100 group-hover:opacity-100"
                    style={{
                      background: "rgba(18,18,22,0.96)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      boxShadow: "0 10px 24px -10px rgba(0,0,0,0.7)",
                    }}
                  >
                    {d.day} · {formatDuration(d.seconds)}
                  </div>
                  <div
                    className="bar-grow w-full rounded-t-[4px] transition-[filter] duration-150 group-hover:brightness-110"
                    style={{
                      height: loaded ? `${heightPct}%` : "0%",
                      background: isToday
                        ? `linear-gradient(180deg, rgba(170,200,255,1), rgb(${ACCENT}))`
                        : "rgba(255,255,255,0.12)",
                      boxShadow: isToday
                        ? `0 0 16px -4px rgba(${ACCENT},0.6)`
                        : "none",
                      transitionDelay: `${i * 40}ms`,
                    }}
                  />
                </div>
                <span
                  className="text-xs font-medium"
                  style={{
                    color: isToday ? `rgb(${ACCENT})` : "rgb(113,113,122)",
                  }}
                >
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .bar-grow {
          transition: height 600ms cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </GlassPanel>
  );
}

const BUCKETS = [0, 1, 30 * 60, 2 * 3600, 4 * 3600];
const BUCKET_OPACITY = [0.09, 0.28, 0.48, 0.72, 1];

function bucketFor(seconds) {
  let idx = 0;
  for (let i = 0; i < BUCKETS.length; i++) {
    if (seconds >= BUCKETS[i]) idx = i;
  }
  return idx;
}

function NoteCard({ value, onChange, mounted, delay }) {
  const [saved, setSaved] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef(null);
  const saveTimeout = useRef(null);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  useEffect(() => {
    autosize();
  }, [value]);

  function handleChange(e) {
    onChange(e.target.value);
    setSaved(false);
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => setSaved(true), 700);
  }

  return (
    <GlassPanel mounted={mounted} delay={delay} accent={false} solid>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm text-zinc-400">Note to self</h3>
        <span
          className={`text-[11px] font-medium text-emerald-300 transition-opacity duration-500 ${
            saved && value ? "opacity-100" : "opacity-0"
          }`}
        >
          Saved
        </span>
      </div>

      <div
        className="mt-4 rounded-xl transition-shadow duration-300"
        style={{
          border: `1px solid ${focused ? `rgba(${ACCENT},0.5)` : "rgba(255,255,255,0.08)"}`,
          boxShadow: focused ? `0 0 0 3px rgba(${ACCENT},0.12)` : "none",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <textarea
          ref={textareaRef}
          rows={2}
          className="w-full resize-none bg-transparent p-3.5 text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          placeholder="Anything on your mind…"
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
    </GlassPanel>
  );
}

function ActivityHeatmap({ heatmap, loaded, mounted, delay }) {
  const days = heatmap || [];
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  const activeDays = days.filter((d) => d.seconds > 0).length;

  let cellIndex = 0;

  return (
    <GlassPanel mounted={mounted} delay={delay}>
      <div className="flex items-baseline justify-between ">
        <div>
          <h3 className="text-sm text-zinc-400">Activity</h3>
          <p className="mt-0.5 text-xs text-zinc-600">
            Last {days.length || 182} days
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-white tabular-nums">
            <AnimatedNumber value={activeDays} />
          </div>
          <div className="text-[11px] text-zinc-600">active days</div>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((d) => {
                const idx = cellIndex++;
                const opacity = BUCKET_OPACITY[bucketFor(d.seconds)];
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${formatDuration(d.seconds)}`}
                    className="cell-reveal h-[9px] w-[9px] rounded-[2px] transition-transform duration-150 hover:scale-125 hover:z-10"
                    style={{
                      background: `rgba(${ACCENT},${opacity})`,
                      animationDelay: loaded
                        ? `${Math.min(idx * 1.2, 500)}ms`
                        : "0ms",
                      opacity: loaded ? undefined : 0,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-600">
        <span>Less</span>
        {BUCKET_OPACITY.map((o, i) => (
          <span
            key={i}
            className="h-[9px] w-[9px] rounded-[2px]"
            style={{ background: `rgba(${ACCENT},${o})` }}
          />
        ))}
        <span>More</span>
      </div>

      <style jsx>{`
        .cell-reveal {
          animation: cellFade 260ms ease-out both;
        }
        @keyframes cellFade {
          from {
            opacity: 0;
            transform: scale(0.6);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .cell-reveal {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>
    </GlassPanel>
  );
}