// Google Core Web Vitals thresholds (good / needs-improvement / poor).
// LCP & INP in ms; CLS unitless. https://web.dev/articles/vitals
export const CWV: Record<'lcp' | 'inp' | 'cls', { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
};

export type Band = 'good' | 'ni' | 'poor' | 'na';

export function band(metric: 'lcp' | 'inp' | 'cls', value: number | null | undefined): Band {
  if (value == null) return 'na';
  const t = CWV[metric];
  return value <= t.good ? 'good' : value <= t.poor ? 'ni' : 'poor';
}

// Performance score bands: >=85 pass, 60-84 needs work, <60 critical.
export function scoreBand(score: number | null | undefined): Band {
  if (score == null) return 'na';
  return score >= 85 ? 'good' : score >= 60 ? 'ni' : 'poor';
}

export const BAND_HEX: Record<Band, string> = {
  good: '#16a34a', ni: '#eab308', poor: '#ef4444', na: '#525252',
};
