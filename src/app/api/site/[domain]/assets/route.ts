import { NextResponse } from 'next/server';
import { scanAssets } from '@/lib/assets';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bare = (h: string) => h.toLowerCase().replace(/^www\./, '');

// On-demand script & CSS weight scan for ONE page. Defaults to the homepage; optional ?url= lets the
// user point it at another page on the SAME site (host must match). App-side only.
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const d = decodeURIComponent(domain);
  const qsUrl = new URL(req.url).searchParams.get('url');

  let target = `https://${d}/`;
  if (qsUrl) {
    let parsed: URL;
    try { parsed = new URL(/^https?:\/\//i.test(qsUrl) ? qsUrl : `https://${d.replace(/\/$/, '')}/${qsUrl.replace(/^\//, '')}`); }
    catch { return NextResponse.json({ error: 'invalid url' }, { status: 400 }); }
    if (bare(parsed.hostname) !== bare(d)) return NextResponse.json({ error: `url must be on ${d}` }, { status: 400 });
    target = parsed.href;
  }

  try {
    return NextResponse.json(await scanAssets(target));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'scan failed' }, { status: 502 });
  }
}
