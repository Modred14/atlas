"use client";

import { useEffect, useRef, useState } from "react";

export const owner = {
  firstName: "Favour",
  lastName: "Omirin",
  nickName: "Modred",
};

// Ambient mood per time of day — ties the glow color to the same signal
// that already drives the greeting, instead of picking an arbitrary accent.
const MOOD = {
  AM: { glow: "125,178,255", ring: "125,178,255" }, // cool morning blue
  PM_DAY: { glow: "251,191,36", ring: "251,191,36" }, // warm afternoon gold
  PM_NIGHT: { glow: "129,140,248", ring: "129,140,248" }, // deep evening indigo
};

function formatDuration(totalSeconds = 0) {
  const mins = Math.floor(totalSeconds / 60);
  const hr = Math.floor(mins / 60);
  return `${hr}h ${mins % 60}m`;
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

  const [mounted, setMounted] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);

  useEffect(() => {
    setMounted(true); // triggers the single entrance animation

    async function updateStats() {
      try {
        const [current, stats] = await Promise.all([
          fetch("https://track-vs.netlify.app/api/coding/current").then((r) => r.json()),
          fetch("https://track-vs.netlify.app/api/coding/stats").then((r) => r.json()),
        ]);

        setTodayTotal(formatDuration(current.todaySeconds));
        setWeekTotal(formatDuration(stats.totals?.last7Seconds));
        setStreakDays(stats.streakDays || 0);
        setIsActive(Boolean(current.active));
        setActiveLanguage(current.language || null);
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

      if (clockTime < "12:00:00") {
        setGreeting("Good Morning");
        setTimeOfDay("AM");
        setMood("AM");
      } else if (clockTime < "18:00:00") {
        setGreeting("Good Afternoon");
        setTimeOfDay("PM");
        setMood("PM_DAY");
      } else {
        setGreeting("Good Evening");
        setTimeOfDay("PM");
        setMood("PM_NIGHT");
      }
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
    setTilt({ x: py * -6, y: px * 8 }); // rotateX, rotateY — deliberately subtle
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div className="p-3 overflow-x-hidden">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`relative overflow-hidden rounded-2xl p-6 transition-[transform,opacity] duration-700 ease-out will-change-transform ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
        style={{
          transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 0.2s ease-out, opacity 0.7s ease-out",
          background:
            "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), #0b0b0e",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: `0 20px 60px -20px rgba(0,0,0,0.6), 0 0 40px -18px rgba(${glow},0.35)`,
        }}
      >
        {/* ambient glow blob, color-shifts with time of day */}
        <div
          className="glow-blob"
          style={{
            background: `radial-gradient(circle, rgba(${glow},0.35), transparent 70%)`,
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2 text-[15px] text-zinc-300">
            <span>
              {greeting}, <span className="font-semibold text-white">{owner.nickName}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-500 ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-white/5 text-zinc-500"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "pulse-dot bg-emerald-400" : "bg-zinc-500"}`} />
              {isActive ? `Coding${activeLanguage ? ` · ${activeLanguage}` : ""}` : "Idle"}
            </span>
          </div>

          <div className="mt-2 inline-flex items-start gap-2 font-mono tabular-nums">
            <div
              className="text-6xl sm:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-300"
            >
              {hr}
              <span className="colon-blink">:</span>
              {mins}
            </div>
            <div className="grid pt-3 font-semibold">
              <span className="text-[11px] sm:text-[13px] tracking-tight text-zinc-500">
                {timeOfDay}
              </span>
              <span key={secs} className="tick text-base sm:text-xl text-zinc-300">
                {secs}
              </span>
            </div>
          </div>

          <div className="mt-1 text-sm text-zinc-500">
            {date.toLocaleDateString(undefined, {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <StatChip label="Today" value={todayTotal} />
            <StatChip
              label="Current Streak"
              value={
                <span className="inline-flex items-center gap-1">
                  {streakDays} {streakDays === 1 ? "day" : "days"}
                  <span className="flame">🔥</span>
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
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-24px, 18px) scale(1.08); }
          }
          .colon-blink {
            animation: blink 2s steps(1) infinite;
          }
          @keyframes blink {
            50% { opacity: 0.25; }
          }
          .tick {
            display: inline-block;
            animation: tick 300ms ease-out;
          }
          @keyframes tick {
            0% { opacity: 0.4; transform: translateY(2px) scale(0.94); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          .flame {
            display: inline-block;
            animation: flicker 2.4s ease-in-out infinite;
          }
          @keyframes flicker {
            0%, 100% { transform: scale(1) rotate(0deg); }
            50% { transform: scale(1.12) rotate(-4deg); }
          }
          .pulse-dot {
            animation: pulse 1.6s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5); }
            50% { box-shadow: 0 0 0 4px rgba(52, 211, 153, 0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .glow-blob, .colon-blink, .tick, .flame, .pulse-dot {
              animation: none !important;
            }
          }
        `}</style>
      </div>
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