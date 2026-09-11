"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates numeric text from its previous value to a new one whenever
 * `value` changes. Falls back to an instant snap if the user prefers
 * reduced motion.
 */
function toFinite(n) {
  return Number.isFinite(n) ? n : 0;
}

export default function AnimatedNumber({
  value = 0,
  duration = 600,
  format = (n) => Math.round(toFinite(n)).toLocaleString(),
  className = "",
}) {
  const safeValue = toFinite(value);
  const [display, setDisplay] = useState(safeValue);
  const fromRef = useRef(safeValue);
  const rafRef = useRef(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setDisplay(safeValue);
      fromRef.current = safeValue;
      return;
    }

    const from = fromRef.current;
    const to = safeValue;
    if (from === to) return;

    const start = performance.now();
    cancelAnimationFrame(rafRef.current);

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [safeValue, duration]);

  return <span className={className}>{format(display)}</span>;
}