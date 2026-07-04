import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = supabaseAdmin();
  const { data: sites } = await db.from('pm_sites').select('domain,name,last_run,last_status').eq('include', true);
  // Explicit columns only — never '*' (which would drag the big per-run payload and
  // make this query balloon as the fleet fills). Just the small metrics the table needs.
  const { data: latest } = await db.from('pm_latest_runs')
    .select('domain,strategy,perf_score,lcp_ms,cls,tbt_ms,fcp_ms,si_ms,has_field,crux_lcp_ms,crux_inp_ms,crux_cls,crux_category');

  // Pivot latest runs into { [domain]: { mobile, desktop } }.
  const byDomain = new Map<string, any>();
  for (const r of latest ?? []) {
    const e = byDomain.get(r.domain) ?? {};
    e[r.strategy] = r;
    byDomain.set(r.domain, e);
  }
  const rows = (sites ?? []).map((s) => {
    const e = byDomain.get(s.domain) ?? {};
    return { domain: s.domain, name: s.name, last_run: s.last_run, last_status: s.last_status, mobile: e.mobile ?? null, desktop: e.desktop ?? null };
  });

  const mobileScores = rows.map((r) => r.mobile?.perf_score).filter((n): n is number => n != null);
  let last_run = '';
  try {
    const { data } = await db.from('pm_settings').select('value').eq('key', 'last_run').maybeSingle();
    last_run = data?.value ?? '';
  } catch { /* ignore */ }

  return NextResponse.json({
    cards: {
      sites: rows.length,
      measured: rows.filter((r) => r.mobile || r.desktop).length,
      avg_mobile: mobileScores.length ? Math.round(mobileScores.reduce((a, b) => a + b, 0) / mobileScores.length) : null,
      poor_mobile: rows.filter((r) => r.mobile?.perf_score != null && r.mobile.perf_score < 60).length,
      field_coverage: rows.filter((r) => r.mobile?.has_field || r.desktop?.has_field).length,
    },
    rows,
    has_key: !!process.env.PAGESPEED_API_KEY,
    last_run,
  });
}
