import { NextResponse } from 'next/server';
import { runSites } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro; oldest-first + time budget means daily runs chip through the fleet.

// Vercel Cron hits this daily (see vercel.json). Protected by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const out = await runSites({ maxMs: 270000 });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 502 });
  }
}
