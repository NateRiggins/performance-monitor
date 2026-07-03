// PageSpeed Insights API v5 client. FREE (Google) — no per-call cost, ~25k/day with a key.
// Pulls Lighthouse *lab* metrics + CrUX *field* (real-user) metrics in one call per strategy.
const API_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export type Strategy = 'mobile' | 'desktop';

export type PsiResult = {
  perf_score: number | null;      // 0-100
  lcp_ms: number | null; cls: number | null; tbt_ms: number | null; fcp_ms: number | null; si_ms: number | null;
  has_field: boolean;
  crux_lcp_ms: number | null; crux_inp_ms: number | null; crux_cls: number | null; crux_category: string | null;
};

const asInt = (v: any): number | null => (Number.isFinite(v) ? Math.round(v) : null);
const asNum = (v: any): number | null => (Number.isFinite(v) ? Number(v) : null);
const labMs = (audits: any, id: string) => asInt(audits?.[id]?.numericValue);

// A CrUX metric block: { percentile, category, distributions }. CLS percentile is ×100 (10 → 0.10).
const cruxPct = (metrics: any, key: string): number | null => {
  const p = metrics?.[key]?.percentile;
  return Number.isFinite(p) ? Number(p) : null;
};

export async function runPagespeed(url: string, strategy: Strategy): Promise<PsiResult> {
  const key = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (key) params.set('key', key);
  // PSI can take 30-80s on slow real-world sites; give it room but cap so a hung call
  // doesn't stall the fleet. Failures are caught per-strategy by the runner.
  const r = await fetch(`${API_BASE}?${params.toString()}`, { cache: 'no-store', signal: AbortSignal.timeout(90000) });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.error?.message ?? ''; } catch { /* ignore */ }
    throw new Error(`PSI HTTP ${r.status}${detail ? `: ${String(detail).slice(0, 120)}` : ''}`);
  }
  const data = await r.json();

  const lh = data.lighthouseResult ?? {};
  const audits = lh.audits ?? {};
  const score = lh.categories?.performance?.score;

  // Prefer URL-level field data; fall back to origin-level if the page has none.
  const fe = data.loadingExperience?.metrics ? data.loadingExperience
    : (data.originLoadingExperience?.metrics ? data.originLoadingExperience : null);
  const fm = fe?.metrics ?? null;
  const cruxCls = cruxPct(fm, 'CUMULATIVE_LAYOUT_SHIFT_SCORE');

  return {
    perf_score: Number.isFinite(score) ? Math.round(score * 100) : null,
    lcp_ms: labMs(audits, 'largest-contentful-paint'),
    cls: asNum(audits?.['cumulative-layout-shift']?.numericValue),
    tbt_ms: labMs(audits, 'total-blocking-time'),
    fcp_ms: labMs(audits, 'first-contentful-paint'),
    si_ms: labMs(audits, 'speed-index'),
    has_field: !!fm,
    crux_lcp_ms: cruxPct(fm, 'LARGEST_CONTENTFUL_PAINT_MS'),
    crux_inp_ms: cruxPct(fm, 'INTERACTION_TO_NEXT_PAINT'),
    crux_cls: cruxCls == null ? null : cruxCls / 100, // percentile is ×100
    crux_category: fe?.overall_category ?? null,
  };
}
