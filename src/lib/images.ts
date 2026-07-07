// Per-page image scanner: fetch ONE page, list every image (<img src> + CSS background-image),
// and measure each at browser-equivalent bytes. App-side only — no Agent, no crawl. The user
// supplies the page, so it can never wander into a full-site crawl.

// A Chrome-like UA + modern Accept so optimizers (ShortPixel/NitroPack/Cloudflare) serve the same
// bytes a real browser would download (e.g. WebP), not the original file.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const IMG_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';

export type MediaSource = 'img' | 'background' | 'video' | 'poster';

export type ScannedImage = {
  url: string;
  filename: string;
  size: number | null;      // bytes a browser downloads (Content-Range total / Content-Length)
  format: string;           // from Content-Type, else extension
  width: number | null;     // intrinsic px (best-effort from header bytes)
  height: number | null;
  source: MediaSource;      // img | background | video (file) | poster (video poster image)
  lazy: boolean;            // loading="lazy" (img only)
  error?: string;
};

export type ImageScan = { url: string; count: number; total_bytes: number; measured: number; images: ScannedImage[] };

const basename = (u: string) => {
  try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || u); } catch { return u.split('/').pop() || u; }
};
const extFormat = (u: string) => {
  const m = (u.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1];
  return m ? m.toLowerCase() : '';
};

// Collect media URLs from a page's HTML: <img src> + CSS background-image + <video>/<source>/poster.
function collectUrls(html: string, pageUrl: string): Array<{ url: string; source: MediaSource; lazy: boolean }> {
  const seen = new Map<string, { url: string; source: MediaSource; lazy: boolean }>();
  const resolve = (raw: string): string | null => {
    const s = (raw || '').trim().replace(/&amp;/g, '&');
    if (!s || /^(data:|blob:|javascript:|#)/i.test(s)) return null;
    try { return new URL(s, pageUrl).href.split('#')[0]; } catch { return null; }
  };
  const add = (raw: string | undefined, source: MediaSource, lazy = false) => {
    const u = raw && resolve(raw);
    if (u && !seen.has(u)) seen.set(u, { url: u, source, lazy });
  };
  const attr = (tag: string, name: string) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i')) || [])[1];

  // <img> — use the `src` (not srcset candidates), note loading="lazy".
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    add(attr(tag, 'src'), 'img', /\bloading\s*=\s*["']?\s*lazy/i.test(tag));
  }
  // <video> — the video file(s) (often a background hero video, usually the heaviest asset) + poster.
  for (const block of html.match(/<video\b[^>]*>[\s\S]*?<\/video>|<video\b[^>]*\/?>/gi) || []) {
    const open = (block.match(/<video\b[^>]*>/i) || [''])[0];
    add(attr(open, 'src'), 'video');
    add(attr(open, 'poster'), 'poster');
    for (const s of block.match(/<source\b[^>]*>/gi) || []) add(attr(s, 'src'), 'video'); // list each format offered
  }
  // CSS background-image: url(...) — inline style="" attrs and <style> blocks both live in the HTML.
  const bgRe = /background(?:-image)?\s*:[^;"'}]*url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = bgRe.exec(html)) !== null) add(m[1], 'background');
  return [...seen.values()];
}

// --- intrinsic dimensions from the first bytes of an image (best-effort) ---
function dimsFromBytes(b: Uint8Array): { w: number | null; h: number | null } {
  const none = { w: null, h: null };
  if (b.length < 24) return none;
  const be16 = (i: number) => (b[i] << 8) | b[i + 1];
  const le16 = (i: number) => b[i] | (b[i + 1] << 8);
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: le16(6), h: le16(8) };
  // WebP (RIFF....WEBP)
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const fmt = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fmt === 'VP8X') return { w: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, h: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1 };
    if (fmt === 'VP8 ') return { w: le16(26) & 0x3fff, h: le16(28) & 0x3fff };
    return none; // VP8L (lossless) is bit-packed — skip
  }
  // JPEG — walk segments to the SOF marker (within the bytes we have)
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: be16(i + 5), w: be16(i + 7) };
      }
      i += 2 + be16(i + 2); // skip this segment
    }
  }
  return none;
}

// Measure one image: one bounded ranged GET → size (Content-Range total / Content-Length), format,
// and header bytes for dimensions. Aborts after a small read so a Range-ignoring server can't make
// us download the whole file.
async function measure(url: string, timeoutMs = 12000): Promise<Pick<ScannedImage, 'size' | 'format' | 'width' | 'height' | 'error'>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { Range: 'bytes=0-16383', Accept: IMG_ACCEPT, 'user-agent': BROWSER_UA },
      redirect: 'follow', signal: ctrl.signal,
    });
    // size: prefer the total from Content-Range (206), else Content-Length (full-file 200).
    let size: number | null = null;
    const cr = r.headers.get('content-range');
    const total = cr && (cr.match(/\/(\d+)\s*$/) || [])[1];
    if (total) size = parseInt(total, 10);
    else { const cl = r.headers.get('content-length'); if (cl) size = parseInt(cl, 10); }

    const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
    const format = ct.startsWith('image/') ? ct.slice(6) : (extFormat(url) || ct || '');

    // read a small slice for dimensions, then stop.
    let w: number | null = null, h: number | null = null;
    try {
      const reader = r.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = []; let got = 0;
        while (got < 16384) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value); got += value.length;
        }
        ctrl.abort();
        const buf = new Uint8Array(got); let off = 0;
        for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, got - off)), off); off += c.length; }
        ({ w, h } = dimsFromBytes(buf));
      }
    } catch { /* dims are best-effort */ }

    return { size, format, width: w, height: h };
  } catch (e) {
    return { size: null, format: extFormat(url), width: null, height: null, error: (e as Error)?.name === 'AbortError' ? 'timeout' : 'unreachable' };
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

export async function scanImages(pageUrl: string, opts: { concurrency?: number; max?: number } = {}): Promise<ImageScan> {
  const res = await fetch(pageUrl, { headers: { 'user-agent': BROWSER_UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`page returned HTTP ${res.status}`);
  const html = await res.text();

  let found = collectUrls(html, pageUrl);
  const truncated = found.length > (opts.max ?? 300);
  if (truncated) found = found.slice(0, opts.max ?? 300);

  const measured = await pool(found, opts.concurrency ?? 8, (f) => measure(f.url));
  const images: ScannedImage[] = found.map((f, i) => ({
    url: f.url, filename: basename(f.url), source: f.source, lazy: f.lazy, ...measured[i],
  }));
  // sort biggest-first; unknown sizes sink to the bottom.
  images.sort((a, b) => (b.size ?? -1) - (a.size ?? -1));

  const total_bytes = images.reduce((a, x) => a + (x.size ?? 0), 0);
  return { url: pageUrl, count: images.length, measured: images.filter((x) => x.size != null).length, total_bytes, images };
}
