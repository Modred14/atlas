import { Sun, BarChart3, Radar } from "lucide-react";

// Nav items map 1:1 to real sections that exist on the dashboard —
// no placeholder pages, no fake routes.
export const NAV_ITEMS = [
  { id: "today", label: "Today", icon: Sun },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "radar", label: "Job Radar", icon: Radar },
];