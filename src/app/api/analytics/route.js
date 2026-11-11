// src/app/api/analytics/route.js
import { api, json } from "@/server/http";
import { getAnalytics } from "@/server/analytics";

export const GET = api(async (request) => {
  const days = Number(request.nextUrl.searchParams.get("days")) || 30;
  return json(await getAnalytics({ days }));
});
