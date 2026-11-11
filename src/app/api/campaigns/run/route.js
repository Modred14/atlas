// src/app/api/campaigns/run/route.js
import { api, json } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { runTick } from "@/server/campaigns";

export const maxDuration = 60;

// "Run now": the same pass the scheduler performs, started by hand. All send limits still apply.
export const POST = api(async () => {
  await rateLimit("run-now", 20, 3600);
  return json(await runTick({ budgetMs: 50_000 }));
});
