-- Performance Monitor (PageSpeed Insights) — runs in the SHARED "command-center" Supabase
-- project alongside the other tools. Tables are prefixed pm_ so they don't collide.

-- Sites we measure. Seeded from hm_projects (client domains) via /api/sites/refresh,
-- but self-contained + curatable (toggle include to add/drop a site from runs).
create table if not exists pm_sites (
  domain      text primary key,
  name        text,
  include     boolean not null default true,
  last_run    timestamptz,
  last_status text
);

-- One row per (site, strategy) measurement. History is retained; the view below
-- surfaces the latest per (domain, strategy).
create table if not exists pm_runs (
  id         bigint generated always as identity primary key,
  domain     text not null,
  strategy   text not null,               -- 'mobile' | 'desktop'
  fetched_at timestamptz not null default now(),
  perf_score int,                          -- Lighthouse performance score 0-100
  -- lab (Lighthouse) metrics
  lcp_ms  int,
  cls     numeric,
  tbt_ms  int,
  fcp_ms  int,
  si_ms   int,
  -- field (CrUX real-user) metrics — null when the origin has no field data
  has_field   boolean not null default false,
  crux_lcp_ms int,
  crux_inp_ms int,
  crux_cls    numeric,
  crux_category text                        -- FAST | AVERAGE | SLOW (origin overall)
);
create index if not exists idx_pm_runs_domain on pm_runs(domain, strategy, fetched_at desc);

create table if not exists pm_settings (
  key   text primary key,
  value text
);

alter table pm_sites    enable row level security;
alter table pm_runs     enable row level security;
alter table pm_settings enable row level security;

-- Latest run per (domain, strategy).
create or replace view pm_latest_runs as
  select distinct on (domain, strategy) *
  from pm_runs
  order by domain, strategy, fetched_at desc;
