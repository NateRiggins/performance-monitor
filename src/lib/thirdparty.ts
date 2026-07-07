// Per-page third-party request map: every external domain the page pulls from, grouped by host with
// request counts + bytes. Third parties (analytics, pixels, chat, fonts, embeds) are big TBT drivers
// and often removable. App-side only, no Agent, no crawl.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export type TPType = 'script' | 'style' | 'img' | 'video' | 'font' | 'iframe' | 'hint';
export type TPHost = { host: string; party: 'first' | 'third'; requests: number; bytes: number; measured: number; types: string[] };
export type ThirdPartyScan = {
  url: string;
  hosts: TPHost[];
  summary: { third_domains: number; third_requests: number; third_bytes: number; first_requests: number; total_requests: number };
};

const TWO_LEVEL = new Set(['co.uk', 'org.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.za', 'ne.jp', 'or.jp']);
function registrable(host: string): string {
  const p = host.toLowerCase().split('.');
  if (p.length <= 2) return host.toLowerCase();
  return TWO_LEVEL.has(p.slice(-2).join('.')) ? p.slice(-3).join('.') : p.slice(-2).join('.');
}

function collect(html: string, pageUrl: string): Array<{ url: string; type: TPType }> {
  const out: Array<{ url: string; type: TPType }> = [];
  const push = (raw: string | undefined, type: TPType) => {
    const s = (raw || '').trim().replace(/&amp;/g, '&');
    if (!s || /^(data:|blob:|javascript:|#|mailto:|tel:)/i.test(s)) return;
    try { out.push({ url: new URL(s, pageUrl).href.split('#')[0], type }); } catch { /* skip */ }
  };
  const attr = (tag: string, name: string) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];

  for (const t of html.match(/<script\b[^>]*>/gi) || []) push(attr(t, 'src'), 'script');
  for (const t of html.match(/<img\b[^>]*>/gi) || []) push(attr(t, 'src'), 'img');
  for (const t of html.match(/<iframe\b[^>]*>/gi) || []) push(attr(t, 'src'), 'iframe');
  for (const t of html.match(/<video\b[^>]*>/gi) || []) push(attr(t, 'src'), 'video');
  for (const t of html.match(/<source\b[^>]*>/gi) || []) push(attr(t, 'src'), 'video');
  for (const t of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attr(t, 'rel') || '').toLowerCase(); const href = attr(t, 'href');
    if (rel.includes('stylesheet')) push(href, 'style');
    else if (rel.includes('preconnect') || rel.includes('dns-prefetch')) push(href, 'hint');
    else if (rel.includes('preload') && /font/i.test(attr(t, 'as') || '')) push(href, 'font');
  }
  const bgRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi; let m: RegExpExecArray | null;
  while ((m = bgRe.exec(html)) !== null) { const u = m[1]; push(u, /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u) ? 'font' : 'img'); }
  return out;
}

async function size(url: string, timeoutMs = 10000): Promise<number | null> {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': BROWSER_UA, 'accept-encoding': 'br, gzip, deflate' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const cl = r.headers.get('content-length');
    return cl ? parseInt(cl, 10) : null;
  } catch { return null; }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const idx = i++; if (idx >= items.length) return; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export async function scanThirdParty(pageUrl: string, opts: { maxMeasure?: number } = {}): Promise<ThirdPartyScan> {
  const res = await fetch(pageUrl, { headers: { 'user-agent': BROWSER_UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`page returned HTTP ${res.status}`);
  const html = await res.text();
  const pageDomain = registrable(new URL(pageUrl).hostname);

  // Dedupe resources by URL (keep first type seen).
  const byUrl = new Map<string, TPType>();
  for (const r of collect(html, pageUrl)) if (!byUrl.has(r.url)) byUrl.set(r.url, r.type);

  // Measure bytes for real fetched resources (not connection hints / iframes), bounded.
  const measurable = [...byUrl].filter(([, t]) => t !== 'hint' && t !== 'iframe').map(([url]) => url).slice(0, opts.maxMeasure ?? 80);
  const sizeOf = new Map<string, number | null>();
  const sizes = await pool(measurable, 10, (u) => size(u));
  measurable.forEach((u, i) => sizeOf.set(u, sizes[i]));

  // Group by host.
  const hosts = new Map<string, TPHost>();
  for (const [url, type] of byUrl) {
    let host: string; try { host = new URL(url).hostname; } catch { continue; }
    const party: 'first' | 'third' = registrable(host) === pageDomain ? 'first' : 'third';
    let h = hosts.get(host);
    if (!h) { h = { host, party, requests: 0, bytes: 0, measured: 0, types: [] }; hosts.set(host, h); }
    h.requests++;
    if (!h.types.includes(type)) h.types.push(type);
    const b = sizeOf.get(url);
    if (b != null) { h.bytes += b; h.measured++; }
  }

  const list = [...hosts.values()].sort((a, b) =>
    a.party !== b.party ? (a.party === 'third' ? -1 : 1) : (b.bytes - a.bytes) || (b.requests - a.requests));
  const third = list.filter((h) => h.party === 'third');
  return {
    url: pageUrl, hosts: list,
    summary: {
      third_domains: third.length,
      third_requests: third.reduce((s, h) => s + h.requests, 0),
      third_bytes: third.reduce((s, h) => s + h.bytes, 0),
      first_requests: list.filter((h) => h.party === 'first').reduce((s, h) => s + h.requests, 0),
      total_requests: list.reduce((s, h) => s + h.requests, 0),
    },
  };
}
