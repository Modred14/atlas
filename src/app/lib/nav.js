// src/app/lib/nav.js
import {
  BarChart3,
  Building2,
  Inbox,
  LayoutDashboard,
  MailCheck,
  PenLine,
  Radar,
  Send,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";

// Every item is a real route. Overview is the original dashboard and stays the landing page.
export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/agent", label: "AI Career Agent", icon: Sparkles },
  { href: "/studio", label: "Email Studio", icon: PenLine },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/campaigns", label: "Email Campaigns", icon: Send, badge: "pending" },
  { href: "/sent", label: "Sent Emails", icon: MailCheck },
  { href: "/inbox", label: "Responses & Inbox", icon: Inbox, badge: "unread" },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

// The original dashboard's own sections (scroll targets on "/"), kept exactly as they were.
export const OVERVIEW_SECTIONS = [
  { id: "today", label: "Today", icon: Sun },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "radar", label: "Job Radar", icon: Radar },
];

export function isActive(pathname, href) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
