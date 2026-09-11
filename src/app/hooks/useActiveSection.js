"use client";

import { useEffect, useState } from "react";

/**
 * Watches a list of section ids and returns whichever one is currently
 * most visible in the viewport, so nav UIs can highlight the right item
 * as the user scrolls a single-page dashboard.
 */
export function useActiveSection(ids, options = {}) {
  const [activeId, setActiveId] = useState(ids[0]);

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (elements.length === 0) return;

    const ratios = new Map();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          ratios.set(entry.target.id, entry.intersectionRatio);
        });

        let bestId = null;
        let bestRatio = 0;
        ratios.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        });

        if (bestId && bestRatio > 0.08) {
          setActiveId(bestId);
        }
      },
      {
        threshold: [0, 0.08, 0.25, 0.5, 0.75, 1],
        rootMargin: options.rootMargin || "-15% 0px -55% 0px",
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return activeId;
}