"use client";

import { NAV_ITEMS } from "../lib/nav";
import { useActiveSection } from "../hooks/useActiveSection";

const SECTION_IDS = NAV_ITEMS.map((item) => item.id);

export default function MobileNav() {
  const activeId = useActiveSection(SECTION_IDS, {
    rootMargin: "-10% 0px -70% 0px",
  });

  function goTo(id) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-white/[0.08] bg-[#0b0b0e]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      style={{ boxShadow: "0 -12px 30px -18px rgba(0,0,0,0.6)" }}
    >
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activeId === id;
        return (
          <button
            key={id}
            onClick={() => goTo(id)}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors duration-200"
            style={{ color: active ? "rgb(77,141,255)" : "rgb(113,113,122)" }}
          >
            <Icon size={19} strokeWidth={2.2} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
