import { NextResponse } from 'next/server';
import { refreshSites } from '@/lib/sites';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const out = await refreshSites();
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 502 });
  }
}
