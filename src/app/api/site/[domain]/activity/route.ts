import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Per-site activity feed: this site's own events (re-measures + analyses). Fleet scans are
// dashboard-level, not shown here. Paginated (offset/limit); returns `total` for page controls.
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const d = decodeURIComponent(domain);
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const { data, error, count } = await supabaseAdmin()
    .from('pm_activity')
    .select('id,domain,event,strategy,score,status,source,detail,created_at', { count: 'exact' })
    .eq('domain', d)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}
