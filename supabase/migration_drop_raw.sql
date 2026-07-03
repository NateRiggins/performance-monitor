-- Session 32 fix: drop the pm_runs.raw column (the full PSI JSON, ~100KB/row).
-- It's unused and was making the dashboard's latest-runs query balloon (~15MB at 156
-- rows → ~1 min load / timeouts). The view select * baked raw in, so drop + recreate it.
-- Run once in the shared Supabase SQL Editor.

drop view if exists pm_latest_runs;

alter table pm_runs drop column if exists raw;

create or replace view pm_latest_runs as
  select distinct on (domain, strategy) *
  from pm_runs
  order by domain, strategy, fetched_at desc;
