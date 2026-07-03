import { NextResponse } from 'next/server';
import { runSites } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro.

// Vercel Cron hits this every 5 min (see vercel.json). Each tick runs a bounded batch
// (oldest-first, skips fresh), so the fleet fills in ~1-3h then idles on the freshness
// guard. maxMs is kept UNDER the 5-min interval so ticks never overlap. CRON_SECRET-protected.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const out = await runSites({ maxMs: 240000 });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 502 });
  }
}
