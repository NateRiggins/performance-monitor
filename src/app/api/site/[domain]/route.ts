import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const d = decodeURIComponent(domain);
  const db = supabaseAdmin();
  const { data: site } = await db.from('pm_sites').select('*').eq('domain', d).maybeSingle();
  if (!site) return NextResponse.json({ error: 'unknown' }, { status: 404 });

  const { data: runs } = await db.from('pm_runs')
    .select('strategy,fetched_at,perf_score,lcp_ms,cls,tbt_ms,fcp_ms,si_ms,has_field,crux_lcp_ms,crux_inp_ms,crux_cls,crux_category')
    .eq('domain', d).order('fetched_at', { ascending: false }).limit(80);

  // Latest per strategy + ascending history for charts.
  const latest: Record<string, any> = {};
  const history: Record<string, any[]> = { mobile: [], desktop: [] };
  for (const r of runs ?? []) {
    if (!latest[r.strategy]) latest[r.strategy] = r;
    (history[r.strategy] ??= []).push(r);
  }
  for (const k of Object.keys(history)) history[k].reverse();

  return NextResponse.json({ site, latest, history });
}
