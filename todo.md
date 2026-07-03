# Performance Monitor — new tool (PageSpeed Insights)

Free Core Web Vitals + Lighthouse monitoring across the client fleet. Same stack as
Health Monitor (Next.js 16 + shared Supabase + Vercel + cron). Data source: Google
PSI API v5 (free; ~25k calls/day with an API key).

## Locked scope (from you)
- **Homepage only** per site (domain root).
- **Mobile + desktop** — both, tracked separately (~2 calls/site).
- **Lab + field (CrUX)** — Lighthouse lab always; real-user CrUX when the site has it.

## Proposed defaults (confirm or change)
- **Name / dir:** "Performance Monitor" / `performance-monitor`.
- **Site list:** self-contained `pm_sites` table with an `include` flag + a "Refresh sites"
  action that seeds from the existing client domains (`hm_projects`), auto-skipping the
  `AUDIT -` sales audits. Keeps this tool independent + curatable, like HM's projects.
- **Cadence:** daily 6am (it's free, so daily is fine — 294 sites × 2 = ~588 calls/day,
  far under quota). Manual "Run now" too.
- **Infra reuse:** same shared Supabase project; new `PAGESPEED_API_KEY` env; `CRON_SECRET`.

## Schema (pm_ prefix, shared Supabase)
- `pm_sites(domain pk, name, include bool, last_run, last_status)`
- `pm_runs(id, domain, strategy[mobile|desktop], perf_score,
    lab: lcp_ms, cls, tbt_ms, fcp_ms, si_ms;
    field: crux_lcp_ms, crux_inp_ms, crux_cls, crux_category, has_field bool;
    fetched_at, raw jsonb)` + index (domain, strategy, fetched_at desc)
- `pm_latest` view: latest run per (domain, strategy)
- `pm_settings(key pk, value)`

## Build steps
- [ ] Scaffold from health-monitor (package.json, next/ts/tailwind/eslint config, layout,
      globals.css, supabase/admin.ts, .env.local.example, .gitignore).
- [ ] `src/lib/psi.ts` — PSI v5 client: runPagespeed(url, strategy) → parse lab
      (lighthouseResult.audits) + field (loadingExperience / originLoadingExperience).
- [ ] `supabase/schema.sql` — pm_ tables + view above.
- [ ] `src/lib/sync.ts` — iterate included pm_sites, call PSI mobile+desktop, insert
      pm_runs, update pm_sites.last_run/status.
- [ ] `src/lib/sites.ts` — seed/refresh pm_sites from hm_projects (skip AUDIT-).
- [ ] API routes: /api/dashboard, /api/sync, /api/cron/sync (CRON_SECRET), /api/sites/refresh.
- [ ] Dashboard UI: fleet table (mobile+desktop score, CWV pass/fail colored by
      LCP≤2.5s / INP≤200ms / CLS≤0.1), search/sort/filter, distribution + worst-performers
      charts, per-site detail page (lab vs field + history sparkline).
- [ ] vercel.json daily cron; README.

## Needs you
1. **Google PSI API key** — create in Google Cloud (enable "PageSpeed Insights API"),
   add as `PAGESPEED_API_KEY`. Free. Works without a key but heavily rate-limited.
2. New GitHub repo (NateRiggins/performance-monitor) + Vercel import + env vars.
3. Run `supabase/schema.sql` in the shared Supabase.

## Review — built (Session 32)
- Full tool scaffolded: Next.js 16 + shared Supabase + Vercel, cloned from health-monitor.
- Files: psi.ts (PSI v5 client, lab+field), vitals.ts (CWV thresholds), sites.ts (seed from
  hm_projects, skip AUDIT-), sync.ts (oldest-first, time-bounded, 20h freshness guard);
  routes /api/{dashboard,sync,cron/sync,sites,sites/refresh,site/[domain]}; dashboard +
  site detail + settings pages; schema.sql (pm_* tables + pm_latest_runs view); vercel.json
  (daily 07:00 UTC cron); README; .env.local.example.
- `npm install`, `tsc`, `next build` all GREEN (10 routes).
- Scope: homepage · mobile+desktop · lab+field. Cost: $0 (PSI free).

## Still needs YOU (deploy)
1. Create Google PSI API key → `PAGESPEED_API_KEY`.
2. New GitHub repo (e.g. NateRiggins/performance-monitor) + Vercel import + env vars
   (reuse the shared Supabase URL/anon/service_role + CRON_SECRET).
3. Run `supabase/schema.sql` in the shared Supabase.
4. Settings → "Refresh sites from clients" → Dashboard → "Run now" (local first for speed).

## Open verification
- [ ] LIVE PSI parser confirmation — blocked: anon call 429s without a key. Parser matches
      documented PSI/CrUX schema; confirm on first real run with the key.
