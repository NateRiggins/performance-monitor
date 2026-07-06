import { NextResponse } from 'next/server';
import { diagnose, type Strategy } from '@/lib/diagnose';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// On-demand Lighthouse diagnosis (opportunities + diagnostics + AMG-stack fixes). Separate from the
// stored runs — this fetches fresh Lighthouse detail and returns it without writing to the DB.
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const strategy: Strategy = new URL(req.url).searchParams.get('strategy') === 'desktop' ? 'desktop' : 'mobile';
  const url = `https://${decodeURIComponent(domain)}/`;
  try {
    return NextResponse.json(await diagnose(url, strategy));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'diagnosis failed' }, { status: 502 });
  }
}
