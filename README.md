<!-- README.md -->
# Atlas — Modred Admin

The admin dashboard for admin.modred.dev, now with the **AI Career Agent**: company discovery, research, personalised outreach, Gmail sending with mandatory confirmation, campaigns, inbox triage and analytics. The original dashboard is still the default page (**Overview**).

Single-owner app. Nothing is sent without you: every email is either confirmed in a dialog (Email Studio) or approved in the queue (campaigns). Automatic mode exists but is off until you enable it.

## Stack
Next.js 16 (App Router) · Postgres (`pg`) · Gmail API via OAuth 2.0 · pluggable AI provider (Gemini, Groq, OpenRouter, OpenAI, Anthropic, any OpenAI-compatible endpoint).

## Setup

### 1. Database (free)
Create a Neon or Supabase Postgres database and copy the connection string.

### 2. Environment
```bash
cp .env.example .env.local
npm install
npm run gen-secrets                      # prints SESSION_SECRET, ENCRYPTION_KEY, CRON_SECRET
npm run hash-password -- "a long passphrase"   # prints ADMIN_PASSWORD_HASH
```
Fill `.env.local` (and the same variables in your host's environment settings).
Keep `ENCRYPTION_KEY` safe: losing it makes stored Gmail tokens and API keys unreadable (you would reconnect and re-enter keys).

### 3. Migrate
```bash
npm run migrate
```
Plain SQL in `db/migrations/`; applied once each and recorded.

### 4. Google OAuth (Gmail)
1. Google Cloud Console → new project → enable **Gmail API**.
2. OAuth consent screen: External, add `favourdomirin@gmail.com` as a **test user** (a personal Gmail account stays in Testing; refresh tokens for Testing apps expire after 7 days, so either publish the app to "In production" (unverified-app warning, fine for one user) or expect to reconnect weekly).
3. Credentials → OAuth client ID → Web application → authorised redirect URI: `${APP_URL}/api/gmail/callback` (e.g. `https://admin.modred.dev/api/gmail/callback`; add `http://localhost:3000/api/gmail/callback` for local use).
4. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. In the app: Settings → Gmail → **Connect**. No Gmail password is ever entered. Only `favourdomirin@gmail.com` is accepted.

Scopes: `gmail.send` and `gmail.readonly` (readonly is used to read replies in threads Atlas started and bounce notices).

### 5. AI provider
Settings → AI: choose a provider, paste a key (stored encrypted) or set the env var. Free tiers: Gemini (Google AI Studio) and Groq are the usual free options. Free-tier limits and model names change; if you hit a quota the app shows the error and nothing is sent.
Optional: `BRAVE_SEARCH_API_KEY` improves website lookups. Discovery works without it (Remotive and Arbeitnow job boards, plus Gemini grounded search if a Gemini key exists).

### 6. CV from modred.dev
Settings → Documents → CV source URL. Atlas fetches the PDF from that URL (cached, re-checked at send time) and falls back to the last good copy or a manual upload.
**This needs a URL on modred.dev that returns the PDF** (`Content-Type: application/pdf`). If your CV generator only renders in the browser, add a route such as:

```js
// modred.dev: app/api/cv/route.js  (adapt to however the generator builds the PDF)
export async function GET() {
  const pdf = await buildCvPdf(); // Buffer from your existing generator
  return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="Favour_Omirin_CV.pdf"' } });
}
```
Then set the source to `https://modred.dev/api/cv`. Use "Test" in Settings to verify.

### 7. Scheduler
Background work (discovery, queue sending, follow-ups, inbox sync) runs on `POST /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`.
`.github/workflows/tick.yml` calls it every 10 minutes: add repo secrets `ATLAS_APP_URL` and `ATLAS_CRON_SECRET`. GitHub may delay scheduled runs by several minutes; any external cron service works too. Ticks are single-flight and idempotent.

### 8. Deploy
Any Node host (Vercel works). Set all env vars, run `npm run migrate` against the production DB, deploy, then log in at `/login`.

## Safety model
- Final-confirmation dialog shows the exact recipient, subject and body; the server only sends content matching the hash that was shown.
- Queue emails need approval of that exact content; edits cancel the approval.
- Default 20/day, hard cap 100/day, hourly cap, minimum spacing, send window and warm-up ramp. A personal Gmail account allows roughly 500 recipients/day and Google can throttle new automated sending earlier, so keep volumes modest. On a quota error sending pauses.
- Suppression list (emails/domains), 90-day duplicate block, opt-out replies and hard bounces add suppressions automatically.
- Contacts are only **verified** if found on the company's own website, hiring-type inbox or careers page, on a domain that accepts mail. Everything else, including contacts you add by hand, is **unverified** and needs explicit permission to use.
- Drafts are linted against your profile (no invented experience, placeholders, generic filler); failing drafts stay drafts.
- Suggested replies are never sent automatically.

## Scripts
`npm run dev` · `npm run build` · `npm test` (43 tests, in-process Postgres, no network) · `npm run migrate` · `npm run gen-secrets` · `npm run hash-password`

## Notes
- All pages including Overview now require login. Set `PUBLIC_OVERVIEW=true` to leave only `/` public.
- Not verifiable without your credentials: live Gmail, Google OAuth, and AI-provider calls are covered by mocks in tests only. Do a first run with one email to yourself via Email Studio.
