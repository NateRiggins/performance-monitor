import { NextResponse } from 'next/server';
import { getAgentSite, agentConfigured } from '@/lib/agent';

export const dynamic = 'force-dynamic';

// Proxies the site's AMG Agent /site config (WPE install + perf-plugin status). Kept
// separate from /api/site/[domain] so a slow/unreachable Agent never blocks the PSI data.
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  if (!agentConfigured()) return NextResponse.json({ ok: false, error: 'Agent token not configured' });
  const out = await getAgentSite(decodeURIComponent(domain));
  return NextResponse.json(out);
}
