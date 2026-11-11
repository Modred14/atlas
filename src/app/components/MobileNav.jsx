// src/app/components/MobileNav.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { NAV_ITEMS, isActive } from "../lib/nav";
import { owner } from "../lib/owner";
import NavList from "./NavList";
import { signOut } from "./Sidebar";

// Below the lg breakpoint the sidebar becomes a drawer opened from a slim top bar.
export default function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);
  const current = NAV_ITEMS.find((i) => isActive(pathname, i.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector("a")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-white/[0.06] bg-[#0b0b0e]/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <button
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.06]"
        >
          <Menu size={19} />
        </button>
        <span className="text-sm font-medium text-white">{current?.label || "Atlas"}</span>
      </header>

      <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/70 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-white/[0.08] bg-[#0b0b0e] pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div className="leading-tight">
              <div className="text-[13.5px] font-semibold text-white">Atlas</div>
              <div className="text-[11px] text-zinc-500">Personal workspace</div>
            </div>
            <button aria-label="Close navigation" onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06]">
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3">
            {open && <NavList onNavigate={() => setOpen(false)} />}
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
            <span className="truncate text-[13px] text-zinc-400">
              {owner.firstName} {owner.lastName}
            </span>
            <button onClick={signOut} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
