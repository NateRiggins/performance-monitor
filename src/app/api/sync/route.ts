import { NextResponse } from 'next/server';
import { runSites } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro. PSI is slow; a full fleet won't fit — runs oldest-first, bounded.

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    // Leave headroom under maxDuration so the function returns cleanly.
    const out = await runSites({ domains: body.domains ?? null, force: !!body.force, maxMs: 270000 });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 502 });
  }
}
