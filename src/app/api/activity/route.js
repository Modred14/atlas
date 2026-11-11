// src/app/api/activity/route.js
import { api, json } from "@/server/http";
import { recentActivity } from "@/server/log";

export const GET = api(async () => json({ events: await recentActivity(60) }));
