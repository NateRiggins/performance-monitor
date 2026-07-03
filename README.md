# Performance Monitor

PageSpeed / Core Web Vitals dashboard across the client fleet. Next.js 16 (App Router) +
Supabase (Postgres) + Vercel. Data source: **Google PageSpeed Insights API v5** — free
(~25k calls/day with a key), so it runs daily with no per-call cost (unlike the Semrush
Health Monitor).

Measures each site's **homepage**, **mobile + desktop**, capturing both **lab** (Lighthouse)
and **field** (CrUX real-user) metrics: performance score + LCP, INP, CLS, TBT, FCP, Speed Index.

## Setup

### 1. Supabase (shared project)
Runs in the same shared Supabase project as the other tools. Tables are `pm_`-prefixed.
SQL Editor → paste & run `supabase/schema.sql`.

### 2. Env vars
Copy `.env.local.example` → `.env.local` and fill in:

| var | where |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → service_role (server-only) |
| `PAGESPEED_API_KEY` | Google Cloud → enable "PageSpeed Insights API" → API key |
| `CRON_SECRET` | any random string (protects the cron endpoint) |

In Vercel, set the same five under Project → Settings → Environment Variables.

### 3. Run
```
npm install
npm run dev        # http://localhost:3000
```
- **Settings** → *Refresh sites from clients* (seeds `pm_sites` from the Health Monitor's
  client domains, skipping the `AUDIT -` sales audits). Toggle any site's include flag.
- **Dashboard** → *Run now* — measures included sites, **oldest-run first**.

> PSI is slow (~20–30s/URL), so a full fleet won't fit in one serverless invocation. The
> runner is **time-bounded** (`maxMs`) and processes oldest-first; the **daily cron**
> (`/api/cron/sync`, 07:00 UTC) chips through the fleet, and the 20h freshness guard keeps
> re-runs fast. For a fast first fill, run `npm run dev` locally and hit *Run now* a few times.

## Notes
- CWV colored by Google thresholds: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 (good); score ≥90 good, 50–89 needs work, <50 poor.
- Field (CrUX) data only exists for origins with enough real traffic; smaller sites show lab only. INP is field-only.
- All page views read the Supabase cache — zero PSI calls.

## TODO
- Auth gate (currently open, same as Health Monitor).
- Optional: multiple key URLs per site; alerting when a site drops below a score threshold.
