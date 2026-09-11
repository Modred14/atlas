"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

const COLLAPSE_KEY = "atlasSidebarCollapsed";

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored) setCollapsed(stored === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <MobileNav />
      <main
        className={`min-h-full flex-1 pb-24 transition-[padding] duration-300 ease-out lg:pb-0 ${
          collapsed ? "lg:pl-[76px]" : "lg:pl-[240px]"
        }`}
      >
        {children}
      </main>
    </>
  );
}