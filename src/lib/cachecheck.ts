// Per-page cache & compression checker: is the AMG stack actually working on THIS page? Reads the
// response headers of the page + a sample of its assets — compression (Brotli/Gzip), cache lifetime
// (Cache-Control max-age), and the CDN/page-cache HIT/MISS signal. App-side only, no Agent, no crawl.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export type CacheRow = {
  url: string; filename: string; kind: 'page' | 'css' | 'js' | 'img';
  status: number | null;
  encoding: string;              // 'br' | 'gzip' | '' (none)
  max_age: number | null;        // seconds from Cache-Control; null = none/no-store
  cacheable: boolean;            // has a positive max-age and not no-store/no-cache
  hit: string;                   // 'HIT' | 'MISS' | 'DYNAMIC' | 'BYPASS' | '' — from the CDN/page-cache header
  hit_source: string;            // which header reported it (cf-cache-status, x-cache, nitropack…)
  error?: string;
};
export type CacheScan = {
  url: string;
  page: CacheRow & { server: string; cdn: string };
  assets: CacheRow[];
  summary: { assets: number; compressed: number; long_cache: number; hits: number; measured: number };
};

const LONG_CACHE = 2592000; // 30 days — the bar for a "long" static cache lifetime
const basename = (u: string) => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || u); } catch { return u; } };

function parseMaxAge(cc: string): { max_age: number | null; cacheable: boolean } {
  const c = (cc || '').toLowerCase();
  if (!c || /no-store|no-cache|private|max-age\s*=\s*0\b/.test(c)) return { max_age: null, cacheable: false };
  const m = c.match(/s-maxage\s*=\s*(\d+)/) || c.match(/max-age\s*=\s*(\d+)/);
  const v = m ? parseInt(m[1], 10) : null;
  return { max_age: v, cacheable: v != null && v > 0 };
}

// Pull the HIT/MISS signal from whichever CDN/page-cache header is present.
function cacheHit(h: Headers): { hit: string; source: string } {
  const candidates: Array<[string, string]> = [
    ['cf-cache-status', 'cloudflare'],
    ['x-nitropack-cache', 'nitropack'], ['x-nitro-cache', 'nitropack'],
    ['x-rocket-nginx-served-from', 'wp-rocket'], ['x-wp-rocket-cache', 'wp-rocket'],
    ['x-cache', 'cdn'], ['x-cache-status', 'cdn'], ['x-proxy-cache', 'cdn'], ['x-cacheable', 'cdn'],
  ];
  for (const [name, source] of candidates) {
    const v = h.get(name);
    if (v) {
      const up = v.toUpperCase();
      const hit = /HIT/.test(up) ? 'HIT' : /MISS/.test(up) ? 'MISS' : /DYNAMIC|BYPASS|EXPIRED|REVALID/.test(up) ? up.split(/[,\s]/)[0] : v;
      return { hit, source };
    }
  }
  const age = parseInt(h.get('age') || '', 10);
  if (Number.isFinite(age) && age > 0) return { hit: 'HIT', source: 'age' };
  return { hit: '', source: '' };
}

async function head(url: string, kind: CacheRow['kind'], timeoutMs = 12000): Promise<CacheRow> {
  const base: CacheRow = { url, filename: kind === 'page' ? '(page)' : basename(url), kind, status: null, encoding: '', max_age: null, cacheable: false, hit: '', hit_source: '' };
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': BROWSER_UA, 'accept-encoding': 'br, gzip, deflate' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const { max_age, cacheable } = parseMaxAge(r.headers.get('cache-control') || '');
    const { hit, source } = cacheHit(r.headers);
    return { ...base, status: r.status, encoding: (r.headers.get('content-encoding') || '').split(',')[0].trim(), max_age, cacheable, hit, hit_source: source };
  } catch (e) {
    return { ...base, error: (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
}

// A small, representative sample of assets (some CSS, JS, images) — enough to judge the stack.
function sampleAssets(html: string, pageUrl: string): Array<{ url: string; kind: CacheRow['kind'] }> {
  const pick = (re: RegExp, kind: CacheRow['kind'], cap: number) => {
    const out: Array<{ url: string; kind: CacheRow['kind'] }> = []; let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && out.length < cap) {
      try { const u = new URL(m[1], pageUrl).href.split('#')[0]; if (/^https?:/.test(u)) out.push({ url: u, kind }); } catch { /* skip */ }
    }
    return out;
  };
  const seen = new Set<string>();
  const all = [
    ...pick(/<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^>]*\bhref\s*=\s*["']([^"']+)["']/gi, 'css', 6),
    ...pick(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi, 'js', 6),
    ...pick(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi, 'img', 5),
  ];
  return all.filter((a) => !seen.has(a.url) && (seen.add(a.url), true));
}

export async function scanCache(pageUrl: string): Promise<CacheScan> {
  const res = await fetch(pageUrl, { method: 'GET', headers: { 'user-agent': BROWSER_UA, Accept: 'text/html,*/*', 'accept-encoding': 'br, gzip, deflate' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok && res.status !== 304) throw new Error(`page returned HTTP ${res.status}`);
  const html = await res.text();

  const { max_age, cacheable } = parseMaxAge(res.headers.get('cache-control') || '');
  const { hit, source } = cacheHit(res.headers);
  const cdn = res.headers.get('cf-ray') ? 'Cloudflare' : (res.headers.get('x-nitropack-cache') || res.headers.get('x-nitro-cache')) ? 'NitroPack' : (res.headers.get('server') || '');
  const page: CacheScan['page'] = {
    url: pageUrl, filename: '(page)', kind: 'page', status: res.status,
    encoding: (res.headers.get('content-encoding') || '').split(',')[0].trim(),
    max_age, cacheable, hit, hit_source: source,
    server: res.headers.get('server') || '', cdn,
  };

  const sample = sampleAssets(html, pageUrl);
  const assets = await Promise.all(sample.map((s) => head(s.url, s.kind)));
  const measured = assets.filter((a) => a.status != null);
  return {
    url: pageUrl, page, assets,
    summary: {
      assets: assets.length,
      compressed: measured.filter((a) => a.encoding).length,
      long_cache: measured.filter((a) => a.max_age != null && a.max_age >= LONG_CACHE).length,
      hits: measured.filter((a) => a.hit === 'HIT').length,
      measured: measured.length,
    },
  };
}
