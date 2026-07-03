import { supabaseAdmin } from '@/lib/supabase/admin';
import { runPagespeed, type Strategy } from '@/lib/psi';

const STRATEGIES: Strategy[] = ['mobile', 'desktop'];
const FRESH_HOURS = 20;          // skip a site whose last run is newer than this (unless force)
const CONCURRENCY = 4;           // PSI is slow (~20-30s/call) and rate-limited; keep it modest

type DB = ReturnType<typeof supabaseAdmin>;
const isFresh = (ts: any) => !!ts && Date.now() - new Date(ts).getTime() < FRESH_HOURS * 3600 * 1000;
const urlFor = (domain: string) => `https://${domain}/`;

async function runOne(db: DB, site: { domain: string }, deadline: number) {
  const notes: string[] = [];
  let ok = 0;
  for (const strategy of STRATEGIES) {
    // Check the clock BEFORE each PSI call (not just per-site) so a call started late
    // can't push the function past Vercel's hard 300s kill → avoids 504s.
    if (deadline && Date.now() > deadline) { notes.push(`${strategy}: skipped (time budget)`); continue; }
    try {
      const res = await runPagespeed(urlFor(site.domain), strategy);
      await db.from('pm_runs').insert({
        domain: site.domain, strategy,
        perf_score: res.perf_score,
        lcp_ms: res.lcp_ms, cls: res.cls, tbt_ms: res.tbt_ms, fcp_ms: res.fcp_ms, si_ms: res.si_ms,
        has_field: res.has_field,
        crux_lcp_ms: res.crux_lcp_ms, crux_inp_ms: res.crux_inp_ms, crux_cls: res.crux_cls, crux_category: res.crux_category,
      });
      ok++;
    } catch (e: any) {
      notes.push(`${strategy}: ${String(e?.message || e).slice(0, 60)}`);
    }
  }
  const status = ((ok ? `ok: ${ok}/${STRATEGIES.length}` : 'error') + (notes.length ? ` | ${notes.join('; ')}` : '')).slice(0, 200);
  // Only advance last_run when something actually succeeded — otherwise a total failure
  // (e.g. a bad API key) would look "fresh" to the freshness guard and never retry.
  const update: { last_status: string; last_run?: string } = { last_status: status };
  if (ok > 0) update.last_run = new Date().toISOString();
  await db.from('pm_sites').update(update).eq('domain', site.domain);
  return { domain: site.domain, ok, notes };
}

export type RunOpts = { domains?: string[] | null; force?: boolean; maxMs?: number };

// Runs PSI for included sites, oldest-run first. maxMs caps wall-clock so a serverless
// invocation self-limits (the fleet is too big for one 300s function; daily cron chips away).
export async function runSites({ domains = null, force = false, maxMs = 0 }: RunOpts = {}) {
  const db = supabaseAdmin();
  let q = db.from('pm_sites').select('domain,last_run').order('last_run', { ascending: true, nullsFirst: true });
  q = domains && domains.length ? q.in('domain', domains) : q.eq('include', true);
  const { data } = await q;
  let queue = (data ?? []) as { domain: string; last_run: string | null }[];
  if (!force) queue = queue.filter((s) => !isFresh(s.last_run));

  const start = Date.now();
  const deadline = maxMs > 0 ? start + maxMs : 0;
  const pending = queue.slice();
  const results: { domain: string; ok: number; notes: string[] }[] = [];
  const budgetHit = () => deadline > 0 && Date.now() > deadline;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (pending.length) {
      if (budgetHit()) break;
      const s = pending.shift();
      if (s) results.push(await runOne(db, s, deadline));
    }
  });
  await Promise.all(workers);

  await db.from('pm_settings').upsert({ key: 'last_run', value: new Date().toISOString() });
  return { results, ran: results.length, skipped_remaining: pending.length, stopped_early: budgetHit() };
}
