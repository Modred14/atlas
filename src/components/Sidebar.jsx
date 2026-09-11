"use client";

import { NAV_ITEMS } from "../lib/nav";
import { owner } from "../lib/owner";
import { useActiveSection } from "../hooks/useActiveSection";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const SECTION_IDS = NAV_ITEMS.map((item) => item.id);

function initials(first, last) {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase();
}

export default function Sidebar({ collapsed, onToggleCollapsed }) {
  const activeId = useActiveSection(SECTION_IDS);

  function goTo(id) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.06] bg-[#0b0b0e]/80 backdrop-blur-xl transition-[width] duration-300 ease-out lg:flex ${
        collapsed ? "w-[76px]" : "w-[240px]"
      }`}
    >
      {/* Brand */}
      <div
        className={`flex items-center gap-2.5 px-5 pt-6 pb-5 ${collapsed ? "justify-center px-0" : ""}`}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, rgb(77,141,255), rgba(140,120,255,1))",
            boxShadow: "0 6px 18px -6px rgba(77,141,255,0.55)",
          }}
        >
          A
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13.5px] font-semibold tracking-tight text-white">
              Atlas
            </div>
            <div className="truncate text-[11px] text-zinc-500">
              Personal workspace
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeId === id;
          return (
            <button
              key={id}
              onClick={() => goTo(id)}
              title={collapsed ? label : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                collapsed ? "justify-center px-0" : ""
              } ${
                active
                  ? "text-white"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
              style={
                active
                  ? {
                      background: "rgba(77,141,255,0.12)",
                    }
                  : undefined
              }
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full"
                  style={{ background: "rgb(77,141,255)" }}
                />
              )}
              <Icon
                size={17}
                strokeWidth={2.1}
                className={active ? "text-[rgb(77,141,255)]" : ""}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Profile + collapse */}
      <div className="border-t border-white/[0.06] p-3">
        <div
          className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${collapsed ? "justify-center px-0" : ""}`}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-zinc-200"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {initials(owner.firstName, owner.lastName)}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-medium text-zinc-200">
                {owner.firstName} &ldquo;{owner.nickName}&rdquo;
              </div>
              <div className="truncate text-[11px] text-zinc-500">
                {owner.role}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCollapsed}
          className={`mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
