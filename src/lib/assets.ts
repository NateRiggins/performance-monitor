// Per-page script & CSS weight scanner: fetch ONE page, list every <script src> and stylesheet,
// and measure each at real transfer size (compressed, what a browser downloads). App-side only —
// no Agent, no crawl. Sibling to the image scanner; JS/CSS is the other half of page weight.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export type AssetType = 'js' | 'css';
export type ScannedAsset = {
  url: string;
  filename: string;
  type: AssetType;
  size: number | null;        // transfer bytes (compressed) from Content-Length; null if the server omits it
  encoding: string;           // 'br' | 'gzip' | '' (none) — is compression on?
  party: 'first' | 'third';
  render_blocking: boolean;   // blocks first paint (head CSS, or head sync non-module script)
  note: string;               // async / defer / module / media=print / render-blocking
  error?: string;
};
export type AssetScan = {
  url: string;
  count: number;
  total_bytes: number;
  measured: number;
  js: { count: number; bytes: number };
  css: { count: number; bytes: number };
  render_blocking: number;
  third_party: number;
  assets: ScannedAsset[];
};

const basename = (u: string) => {
  try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || u); } catch { return u.split('/').pop() || u; }
};
const bareHost = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const attr = (tag: string, name: string) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];
const hasFlag = (tag: string, name: string) => new RegExp(`\\b${name}\\b`, 'i').test(tag);

// Collect scripts + stylesheets, noting whether each sits in <head> (for render-blocking) and its attrs.
function collect(html: string, pageUrl: string): Array<{ url: string; type: AssetType; render_blocking: boolean; note: string }> {
  const headEnd = (() => { const i = html.search(/<\/head>/i); return i === -1 ? html.length : i; })();
  const seen = new Map<string, { url: string; type: AssetType; render_blocking: boolean; note: string }>();
  const resolve = (raw: string): string | null => {
    const s = (raw || '').trim().replace(/&amp;/g, '&');
    if (!s || /^(data:|blob:|javascript:|#)/i.test(s)) return null;
    try { return new URL(s, pageUrl).href.split('#')[0]; } catch { return null; }
  };

  // <script src> — in-head sync (non-module, non-async/defer) is render-blocking.
  const scriptRe = /<script\b[^>]*>/gi; let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const tag = m[0]; const src = attr(tag, 'src'); const u = src && resolve(src);
    if (!u) continue;
    const inHead = m.index < headEnd;
    const isAsync = hasFlag(tag, 'async'), isDefer = hasFlag(tag, 'defer'), isModule = /\btype\s*=\s*["']module["']/i.test(tag);
    const blocking = inHead && !isAsync && !isDefer && !isModule;
    const note = isAsync ? 'async' : isDefer ? 'defer' : isModule ? 'module' : blocking ? 'render-blocking' : 'body';
    if (!seen.has(u)) seen.set(u, { url: u, type: 'js', render_blocking: blocking, note });
  }
  // <link rel="stylesheet"> — in-head with a screen/all media is render-blocking; media="print" is not.
  const linkRe = /<link\b[^>]*>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b/i.test(tag)) continue;
    const href = attr(tag, 'href'); const u = href && resolve(href);
    if (!u) continue;
    const media = (attr(tag, 'media') || '').toLowerCase();
    const nonBlockingMedia = media.includes('print');
    const inHead = m.index < headEnd;
    const blocking = inHead && !nonBlockingMedia;
    const note = nonBlockingMedia ? `media=${media}` : blocking ? 'render-blocking' : 'body';
    if (!seen.has(u)) seen.set(u, { url: u, type: 'css', render_blocking: blocking, note });
  }
  return [...seen.values()];
}

// Measure real transfer size: GET with compression negotiated, read Content-Length + Content-Encoding
// from the response headers, then abort before downloading the body.
async function measure(url: string, timeoutMs = 12000): Promise<Pick<ScannedAsset, 'size' | 'encoding' | 'error'>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': BROWSER_UA, 'accept-encoding': 'br, gzip, deflate', Accept: '*/*' },
      redirect: 'follow', signal: ctrl.signal,
    });
    const cl = r.headers.get('content-length');
    const encoding = (r.headers.get('content-encoding') || '').split(',')[0].trim();
    ctrl.abort(); // don't download the body — headers are all we need
    return { size: cl ? parseInt(cl, 10) : null, encoding };
  } catch (e) {
    return { size: null, encoding: '', error: (e as Error)?.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(t);
  }
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) { const idx = i++; if (idx >= items.length) return; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export async function scanAssets(pageUrl: string, opts: { concurrency?: number; max?: number } = {}): Promise<AssetScan> {
  const res = await fetch(pageUrl, { headers: { 'user-agent': BROWSER_UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`page returned HTTP ${res.status}`);
  const html = await res.text();
  const pageHost = bareHost(pageUrl);

  let found = collect(html, pageUrl);
  if (found.length > (opts.max ?? 300)) found = found.slice(0, opts.max ?? 300);

  const measured = await pool(found, opts.concurrency ?? 10, (f) => measure(f.url));
  const assets: ScannedAsset[] = found.map((f, i) => ({
    url: f.url, filename: basename(f.url), type: f.type, render_blocking: f.render_blocking, note: f.note,
    party: bareHost(f.url) === pageHost ? 'first' : 'third', ...measured[i],
  }));
  assets.sort((a, b) => (b.size ?? -1) - (a.size ?? -1));

  const js = assets.filter((a) => a.type === 'js');
  const css = assets.filter((a) => a.type === 'css');
  const bytes = (list: ScannedAsset[]) => list.reduce((s, a) => s + (a.size ?? 0), 0);
  return {
    url: pageUrl,
    count: assets.length,
    total_bytes: bytes(assets),
    measured: assets.filter((a) => a.size != null).length,
    js: { count: js.length, bytes: bytes(js) },
    css: { count: css.length, bytes: bytes(css) },
    render_blocking: assets.filter((a) => a.render_blocking).length,
    third_party: assets.filter((a) => a.party === 'third').length,
    assets,
  };
}
