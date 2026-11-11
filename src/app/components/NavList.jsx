// src/app/components/NavList.jsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isActive, NAV_ITEMS, OVERVIEW_SECTIONS } from "../lib/nav";
import { useActiveSection } from "../hooks/useActiveSection";

const BLUE = "rgb(77,141,255)";

export function useNavCounts() {
  const pathname = usePathname();
  const [counts, setCounts] = useState({ pending: 0, unread: 0 });
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/nav-counts")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setCounts(d.show === false ? { pending: 0, unread: 0 } : { pending: Number(d.pending) || 0, unread: Number(d.unread) || 0 }))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);
  return counts;
}

// Mounted only while on "/", so the scroll-spy re-attaches every time the dashboard is shown.
function OverviewSections({ collapsed, onNavigate }) {
  const ids = OVERVIEW_SECTIONS.map((s) => s.id);
  const activeId = useActiveSection(ids);
  if (collapsed) return null;
  return (
    <div className="mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l border-white/[0.07] pl-2.5">
      {OVERVIEW_SECTIONS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => {
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            onNavigate?.();
          }}
          className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
            activeId === id ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function NavList({ collapsed = false, onNavigate }) {
  const pathname = usePathname();
  const counts = useNavCounts();

  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
        const active = isActive(pathname, href);
        const count = badge ? counts[badge] : 0;
        return (
          <div key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[rgb(77,141,255)] ${
                collapsed ? "justify-center px-0" : ""
              } ${active ? "text-white" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"}`}
              style={active ? { background: "rgba(77,141,255,0.12)" } : undefined}
            >
              {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full" style={{ background: BLUE }} />}
              <span className="relative">
                <Icon size={17} strokeWidth={2.1} style={active ? { color: BLUE } : undefined} />
                {collapsed && count > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full" style={{ background: BLUE }} />}
              </span>
              {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
              {!collapsed && count > 0 && (
                <span className="rounded-md px-1.5 py-px text-[11px] font-semibold tabular-nums" style={{ background: "rgba(77,141,255,0.18)", color: "rgb(140,185,255)" }}>
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
            {href === "/" && active && <OverviewSections collapsed={collapsed} onNavigate={onNavigate} />}
          </div>
        );
      })}
    </nav>
  );
}
