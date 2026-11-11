// src/app/components/AppShell.jsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import { ToastProvider } from "./ui";

const COLLAPSE_KEY = "atlasSidebarCollapsed";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      if (stored) setCollapsed(stored === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  // The sign-in page has no navigation.
  if (pathname === "/login") return <ToastProvider>{children}</ToastProvider>;

  return (
    <ToastProvider>
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <MobileNav />
      <main
        className={`min-h-full flex-1 transition-[padding] duration-300 ease-out ${
          collapsed ? "lg:pl-[76px]" : "lg:pl-[240px]"
        }`}
      >
        {children}
      </main>
    </ToastProvider>
  );
}
