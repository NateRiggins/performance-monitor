import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = supabaseAdmin();
  const { data: sites } = await db.from('pm_sites').select('domain,name,include,last_run,last_status').order('domain');
  let last_site_refresh = '';
  try {
    const { data } = await db.from('pm_settings').select('value').eq('key', 'last_site_refresh').maybeSingle();
    last_site_refresh = data?.value ?? '';
  } catch { /* ignore */ }
  return NextResponse.json({ sites: sites ?? [], has_key: !!process.env.PAGESPEED_API_KEY, last_site_refresh });
}

// Toggle whether a site is included in runs.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const domain = String(body.domain ?? '');
  if (!domain) return NextResponse.json({ ok: false, error: 'domain required' }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from('pm_sites').update({ include: !!body.include }).eq('domain', domain);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
