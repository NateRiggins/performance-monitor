import { NextResponse } from 'next/server';
import { getAgentSite, agentConfigured } from '@/lib/agent';
import { lookupServer } from '@/lib/sites';

export const dynamic = 'force-dynamic';

// Proxies the site's AMG Agent /site config (WPE install + perf-plugin status). Kept
// separate from /api/site/[domain] so a slow/unreachable Agent never blocks the PSI data.
// `server` (the WPE account, e.g. amgclient4) comes from the shared fleet audit — independent of
// the Agent, so it shows even when the Agent is unreachable. Servers 4 & 5 don't offer NitroPack.
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const d = decodeURIComponent(domain);
  const server = await lookupServer(d).catch(() => null);
  if (!agentConfigured()) return NextResponse.json({ ok: false, error: 'Agent token not configured', server });
  const out = await getAgentSite(d);
  return NextResponse.json({ ...out, server });
}
