// src/app/api/gmail/status/route.js
import { api, json } from "@/server/http";
import { allowedAccount, getAccount } from "@/server/gmail";
import { getSetting } from "@/server/settings";
import { sendStats, effectiveDailyLimit } from "@/server/outreach";

export const GET = api(async () => {
  const account = await getAccount();
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
  const safety = await getSetting("safety");
  const stats = await sendStats(safety.sendWindow.timezone);
  return json({
    configured,
    allowedAccount: allowedAccount(),
    account: account && { email: account.email, status: account.status, lastError: account.last_error, connectedAt: account.connected_at },
    sending: {
      today: stats.today,
      lastHour: stats.last_hour,
      todayLimit: effectiveDailyLimit({ target: safety.dailyHardCap, safety, firstSent: stats.first_sent }),
      hardCap: safety.dailyHardCap,
      // Google's published limit for consumer Gmail accounts; Workspace accounts get more.
      gmailPublishedLimit: 500,
    },
  });
});
