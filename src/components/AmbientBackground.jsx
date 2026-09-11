"use client";

import { useEffect, useState } from "react";

const GLOW_BY_HOUR = (hour) => {
  if (hour < 6) return "129,140,248"; // late night — indigo
  if (hour < 12) return "125,178,255"; // morning — blue
  if (hour < 18) return "77,141,255"; // afternoon — signature blue
  return "251,191,36"; // evening — amber
};

/**
 * A restrained, CSS-only depth layer: two slow-drifting blurred orbs plus a
 * faint vignette and a barely-there grid. Gives the shell a sense of depth
 * and "futuristic OS" ambience without the weight of a 3D scene/library.
 * Purely decorative — fixed, pointer-events-none, behind everything.
 */
export default function AmbientBackground() {
  const [glow, setGlow] = useState("77,141,255");

  useEffect(() => {
    const update = () => setGlow(GLOW_BY_HOUR(new Date().getHours()));
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0a0a0c]">
      <div
        className="ambient-orb ambient-orb-a"
        style={{ background: `radial-gradient(circle, rgba(${glow},0.16), transparent 70%)` }}
      />
      <div
        className="ambient-orb ambient-orb-b"
        style={{ background: "radial-gradient(circle, rgba(140,120,255,0.10), transparent 70%)" }}
      />
      <div className="ambient-grid" />
      <div className="ambient-vignette" />

      <style jsx>{`
        .ambient-orb {
          position: absolute;
          width: 46vw;
          height: 46vw;
          max-width: 640px;
          max-height: 640px;
          border-radius: 9999px;
          filter: blur(70px);
          will-change: transform;
        }
        .ambient-orb-a {
          top: -12%;
          right: -8%;
          animation: driftA 34s ease-in-out infinite;
        }
        .ambient-orb-b {
          bottom: -18%;
          left: -10%;
          animation: driftB 40s ease-in-out infinite;
        }
        @keyframes driftA {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 26px) scale(1.06); }
        }
        @keyframes driftB {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(24px, -20px) scale(1.05); }
        }
        .ambient-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 70%);
        }
        .ambient-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 100% 80% at 50% 0%, transparent 40%, rgba(0,0,0,0.5) 100%);
        }
        @media (prefers-reduced-motion: reduce) {
          .ambient-orb-a, .ambient-orb-b {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}