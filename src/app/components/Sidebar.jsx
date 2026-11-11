// src/app/components/Sidebar.jsx
"use client";

import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { owner } from "../lib/owner";
import NavList from "./NavList";

function initials(first, last) {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase();
}

export async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    // Full reload on purpose: clears all in-memory state after sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
}

export default function Sidebar({ collapsed, onToggleCollapsed }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.06] bg-[#0b0b0e]/80 backdrop-blur-xl transition-[width] duration-300 ease-out lg:flex ${
        collapsed ? "w-[76px]" : "w-[240px]"
      }`}
    >
      {/* Brand (unchanged) */}
      <div className={`flex items-center gap-2.5 px-5 pt-6 pb-5 ${collapsed ? "justify-center px-0" : ""}`}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
          style={{
            background: "linear-gradient(135deg, rgb(77,141,255), rgba(140,120,255,1))",
            boxShadow: "0 6px 18px -6px rgba(77,141,255,0.55)",
          }}
        >
          A
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13.5px] font-semibold tracking-tight text-white">Atlas</div>
            <div className="truncate text-[11px] text-zinc-500">Personal workspace</div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <NavList collapsed={collapsed} />
      </div>

      {/* Profile + collapse (unchanged, plus sign out) */}
      <div className="border-t border-white/[0.06] p-3">
        <div className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${collapsed ? "justify-center px-0" : ""}`}>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-zinc-200"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {initials(owner.firstName, owner.lastName)}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-medium text-zinc-200">
                {owner.firstName} {owner.lastName}
              </div>
              <div className="truncate text-[11px] text-zinc-500">{owner.role}</div>
            </div>
          )}
        </div>

        <button
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <LogOut size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>

        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
