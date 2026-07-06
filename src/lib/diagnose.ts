// On-demand Lighthouse diagnosis from PageSpeed Insights (FREE — same API as the runs, no per-call
// cost). Surfaces the opportunities + diagnostics PSI already returns and maps each to an actionable
// fix in the AMG optimization stack (WP Rocket / NitroPack / ShortPixel). Fetched fresh per request,
// not stored (the raw Lighthouse payload is large — same reason the runs table dropped `raw`).
const API_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export type Strategy = 'mobile' | 'desktop';
export type DiagItem = { id: string; title: string; savingsMs: number | null; displayValue: string; fix: string | null };
export type Diagnosis = { strategy: Strategy; score: number | null; opportunities: DiagItem[]; diagnostics: DiagItem[]; fetchedAt: string };

// Lighthouse audit id → recommended fix in the AMG stack. Kept plain-English + tool-specific so the
// on-call dev knows exactly which toggle to reach for.
const FIX: Record<string, string> = {
  'render-blocking-resources': 'WP Rocket: Optimize CSS delivery + Defer/Delay JS · NitroPack: Remove render-blocking',
  'unused-css-rules': 'NitroPack "Remove Unused CSS" (or WP Rocket) — validate on Elementor/Enfold',
  'unminified-css': 'WP Rocket / NitroPack: Minify CSS',
  'unminified-javascript': 'WP Rocket / NitroPack: Minify JS',
  'unused-javascript': 'WP Rocket: Delay JS execution · NitroPack: Delayed scripts',
  'legacy-javascript': 'WP Rocket: Delay JS · NitroPack: JS optimization',
  'duplicated-javascript': 'Audit plugins/embeds loading duplicate libraries',
  'modern-image-formats': 'ShortPixel: serve WebP/AVIF',
  'uses-optimized-images': 'ShortPixel: compress images',
  'uses-responsive-images': 'ShortPixel adaptive sizing / correct srcset',
  'offscreen-images': 'WP Rocket / NitroPack: LazyLoad images',
  'efficient-animated-content': 'Replace GIFs with video (facade)',
  'uses-text-compression': 'Enable gzip/brotli (WPE default — check the origin)',
  'server-response-time': 'TTFB: caching (WP Rocket / NitroPack) + WPE object cache',
  'redirects': 'Remove redirect chains — point links at the final URL',
  'uses-rel-preconnect': 'Preconnect to critical third-party origins',
  'uses-rel-preload': 'Preload key requests (LCP image / fonts)',
  'uses-long-cache-ttl': 'WP Rocket cache TTL / WPE browser-cache headers',
  'prioritize-lcp-image': 'NitroPack LCP preload (or WP Rocket preload)',
  'total-byte-weight': 'Reduce page weight — images (ShortPixel) + unused JS/CSS',
  'dom-size': 'Builder/theme (Elementor/Enfold) — simplify the DOM; no plugin toggle',
  'third-party-summary': 'NitroPack: Delay non-critical third-party scripts',
  'mainthread-work-breakdown': 'Reduce JS execution — delay scripts (WP Rocket / NitroPack)',
  'bootup-time': 'Reduce JS execution time — delay/remove heavy scripts',
};

// Diagnostics we surface (not "opportunities" with a ms number, but useful signals) when flagged.
const DIAG_IDS = ['mainthread-work-breakdown', 'bootup-time', 'third-party-summary', 'dom-size', 'server-response-time', 'uses-long-cache-ttl', 'total-byte-weight'];

export async function diagnose(url: string, strategy: Strategy = 'mobile'): Promise<Diagnosis> {
  const key = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (key) params.set('key', key);
  const r = await fetch(`${API_BASE}?${params.toString()}`, { cache: 'no-store', signal: AbortSignal.timeout(90000) });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.error?.message ?? ''; } catch { /* ignore */ }
    throw new Error(`PSI HTTP ${r.status}${detail ? `: ${String(detail).slice(0, 120)}` : ''}`);
  }
  const data = await r.json();
  const lh = data.lighthouseResult ?? {};
  const audits: Record<string, any> = lh.audits ?? {};
  const score = lh.categories?.performance?.score;

  const opportunities: DiagItem[] = [];
  const diagnostics: DiagItem[] = [];
  for (const [id, a] of Object.entries(audits)) {
    const sav = a?.details?.overallSavingsMs;
    if (a?.details?.type === 'opportunity' && Number.isFinite(sav) && sav >= 50) {
      opportunities.push({ id, title: a.title ?? id, savingsMs: Math.round(sav), displayValue: a.displayValue ?? '', fix: FIX[id] ?? null });
    } else if (DIAG_IDS.includes(id) && a && a.score !== 1 && a.scoreDisplayMode !== 'notApplicable') {
      diagnostics.push({ id, title: a.title ?? id, savingsMs: null, displayValue: a.displayValue ?? '', fix: FIX[id] ?? null });
    }
  }
  opportunities.sort((x, y) => (y.savingsMs ?? 0) - (x.savingsMs ?? 0));
  return {
    strategy,
    score: Number.isFinite(score) ? Math.round(score * 100) : null,
    opportunities,
    diagnostics,
    fetchedAt: new Date().toISOString(),
  };
}
