import { NextResponse } from 'next/server';
import { diagnose, type Strategy } from '@/lib/diagnose';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// On-demand Lighthouse diagnosis (opportunities + diagnostics + AMG-stack fixes). Separate from the
// stored runs — this fetches fresh Lighthouse detail and returns it without writing to the DB.
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const d = decodeURIComponent(domain);
  const strategy: Strategy = new URL(req.url).searchParams.get('strategy') === 'desktop' ? 'desktop' : 'mobile';
  try {
    const diag = await diagnose(`https://${d}/`, strategy);
    await logActivity({
      domain: d, event: 'analyze', strategy, score: diag.score,
      detail: { opps: diag.opportunities.length, diags: diag.diagnostics.length, topSavingsMs: diag.opportunities[0]?.savingsMs ?? null },
    });
    return NextResponse.json(diag);
  } catch (e) {
    const error = (e as Error).message || 'diagnosis failed';
    await logActivity({ domain: d, event: 'analyze', strategy, status: 'error', detail: { error: error.slice(0, 200) } });
    return NextResponse.json({ error }, { status: 502 });
  }
}
