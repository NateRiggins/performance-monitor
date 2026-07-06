-- Performance Monitor — Activity Log (Session: activity feed)
-- Per-site feed of scans / re-measures / analyses shown under Score history on the detail page.
-- Run in the shared Command Center Supabase project (pyrlnetohkblauwplumf).

create table if not exists pm_activity (
  id         bigint generated always as identity primary key,
  domain     text,                             -- null = fleet-wide event (a full scan)
  event      text not null,                    -- 'scan' | 'remeasure' | 'analyze'
  strategy   text,                             -- 'mobile' | 'desktop' | null (both / n-a)
  score      int,                              -- resulting Lighthouse score when applicable
  status     text not null default 'ok',       -- 'ok' | 'error'
  source     text not null default 'manual',   -- 'manual' | 'cron'
  detail     jsonb,                            -- {mobile, desktop, ran, skipped_remaining, opps, diags, topSavingsMs, error, notes}
  created_at timestamptz not null default now()
);

create index if not exists pm_activity_domain_idx  on pm_activity (domain, created_at desc);
create index if not exists pm_activity_created_idx on pm_activity (created_at desc);

alter table pm_activity enable row level security; -- service-role only, like pm_runs / pm_recommendations
