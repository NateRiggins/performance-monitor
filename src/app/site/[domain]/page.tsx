'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { scoreBand, BAND_HEX, type Band } from '@/lib/vitals';

type Run = {
  strategy: string; fetched_at: string; perf_score: number | null;
  lcp_ms: number | null; cls: number | null; tbt_ms: number | null; fcp_ms: number | null; si_ms: number | null;
  has_field: boolean; crux_lcp_ms: number | null; crux_inp_ms: number | null; crux_cls: number | null; crux_category: string | null;
};
type Data = { site: any; latest: Record<string, Run>; history: Record<string, Run[]> };
type PerfPlugin = { name: string; installed: boolean; active: boolean; version: string };
type AgentData =
  | { ok: true; install: string | null; agent: string | null; perf_plugins: Record<string, PerfPlugin> | null; server: string | null }
  | { ok: false; error: string; server?: string | null }
  | null;
const HEADLINE = ['wp-rocket', 'shortpixel', 'nitropack'];
type DiagItem = { id: string; title: string; savingsMs: number | null; displayValue: string; fix: string | null; serverNote: string | null };
type Diagnosis = { strategy: string; score: number | null; opportunities: DiagItem[]; diagnostics: DiagItem[]; fetchedAt: string };

const tip = { contentStyle: { background: '#171717', border: '1px solid #404040', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#e5e5e5' } };
const fmtMs = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
const fmtCls = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3));
const bandCls = (b: Band) => b === 'good' ? 'text-green-400' : b === 'ni' ? 'text-yellow-400' : b === 'poor' ? 'text-red-400' : 'text-neutral-500';
const vitalBand = (v: number | null | undefined, good: number, poor: number): Band => v == null ? 'na' : v <= good ? 'good' : v <= poor ? 'ni' : 'poor';

// Radial gauge: colored ring filling to the Lighthouse score, number in the center.
function ScoreGauge({ score }: { score: number | null }) {
  const color = BAND_HEX[scoreBand(score)];
  return (
    <div className="relative mx-auto" style={{ width: 168, height: 168 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="76%" outerRadius="100%" data={[{ value: score ?? 0 }]} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: '#262626' }} dataKey="value" cornerRadius={16} fill={color} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold tabular-nums" style={{ color }}>{score ?? '—'}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-widest text-neutral-500">Lighthouse</span>
      </div>
    </div>
  );
}

// Good→needs-work→poor zone bar with a marker at the current value.
function Meter({ value, good, poor, max }: { value: number; good: number; poor: number; max: number }) {
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="relative mt-1.5 h-1.5 w-full rounded-full"
      style={{ background: `linear-gradient(90deg,#16a34a 0 ${pct(good)}%,#eab308 ${pct(good)}% ${pct(poor)}%,#ef4444 ${pct(poor)}% 100%)` }}>
      <div className="absolute -top-1 h-3.5 w-[3px] -translate-x-1/2 rounded bg-white shadow" style={{ left: `${pct(value)}%` }} />
    </div>
  );
}

function Vital({ label, sub, value, fmt, good, poor, max, note }: {
  label: string; sub: string; value: number | null; fmt: (v: number | null) => string; good: number; poor: number; max: number; note?: string;
}) {
  const b = vitalBand(value, good, poor);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-neutral-400">{label} <span className="text-neutral-600">{sub}</span></span>
        <span className={`text-sm font-semibold tabular-nums ${bandCls(b)}`}>{value == null ? (note ?? '—') : fmt(value)}</span>
      </div>
      {value != null && <Meter value={value} good={good} poor={poor} max={max} />}
    </div>
  );
}

function StrategyCard({ label, run }: { label: string; run?: Run }) {
  if (!run) return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <h3 className="text-sm font-semibold">{label}</h3>
      <p className="mt-2 text-sm text-neutral-500">No run yet.</p>
    </div>
  );
  const f = run.has_field;
  const lcp = f ? run.crux_lcp_ms : run.lcp_ms;
  const cls = f ? run.crux_cls : run.cls;
  const inp = f ? run.crux_inp_ms : null;
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        {f
          ? <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-xs text-green-300">field{run.crux_category ? ` · ${run.crux_category}` : ''}</span>
          : <span className="text-xs text-neutral-500">lab only</span>}
      </div>
      <div className="my-3"><ScoreGauge score={run.perf_score} /></div>
      <div className="space-y-3">
        <Vital label="LCP" sub="load" value={lcp} fmt={fmtMs} good={2500} poor={4000} max={6000} />
        <Vital label="INP" sub="responsiveness" value={inp} fmt={fmtMs} good={200} poor={500} max={800} note="lab n/a" />
        <Vital label="CLS" sub="stability" value={cls} fmt={fmtCls} good={0.1} poor={0.25} max={0.5} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-neutral-800 pt-3 text-center text-xs">
        {([['TBT', run.tbt_ms], ['FCP', run.fcp_ms], ['Speed Index', run.si_ms]] as [string, number | null][]).map(([k, v]) => (
          <div key={k}><div className="text-neutral-500">{k}</div><div className="font-medium tabular-nums">{fmtMs(v)}</div></div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ mob, desk }: { mob: Run[]; desk: Run[] }) {
  const n = Math.max(mob.length, desk.length);
  if (n < 2) return null;
  const trend = Array.from({ length: n }, (_, i) => {
    const ref = mob[i] || desk[i];
    return { t: new Date(ref.fetched_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), mobile: mob[i]?.perf_score ?? null, desktop: desk[i]?.perf_score ?? null };
  });
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <h3 className="mb-3 text-sm font-semibold">Score history</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={trend} margin={{ left: -18, right: 8, top: 4 }}>
          <defs>
            <linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
            <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip {...tip} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="desktop" stroke="#22d3ee" fill="url(#gd)" strokeWidth={2} connectNulls dot={false} />
          <Area type="monotone" dataKey="mobile" stroke="#3b82f6" fill="url(#gm)" strokeWidth={2} connectNulls dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Title-bar icon buttons -------------------------------------------------
const ICON_BTN = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';
// Real product logos via Google's favicon service (nothing bundled, so they stay current).
const favicon = (d: string) => `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
const PLUGIN_LABEL: Record<string, string> = { 'wp-rocket': 'WP Rocket', shortpixel: 'ShortPixel', nitropack: 'NitroPack' };

const IconRefresh = ({ spin }: { spin?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={spin ? 'animate-spin' : ''} aria-hidden>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
  </svg>
);
const IconAnalyze = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12h4l2.5 6 4-12 2.5 6H21" />
  </svg>
);
const IconBack = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);
const IconMonitor = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
  </svg>
);
const IconPhone = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" />
  </svg>
);

const Spinner = ({ label }: { label?: string }) => (
  <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 text-sm text-neutral-500">
    <span className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-blue-500" />
    {label && <span>{label}</span>}
  </div>
);

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24); if (d < 30) return d === 1 ? '1 day ago' : `${d} days ago`;
  const mo = Math.floor(d / 30); return mo === 1 ? '1 month ago' : `${mo} months ago`;
}

export default function SiteDetail() {
  const params = useParams();
  const domain = decodeURIComponent(String(params.domain ?? ''));
  const [data, setData] = useState<Data | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [agent, setAgent] = useState<AgentData>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagStrategy, setDiagStrategy] = useState<'mobile' | 'desktop'>('desktop');
  const [diagErr, setDiagErr] = useState('');

  const load = useCallback(() => {
    fetch(`/api/site/${encodeURIComponent(domain)}`).then((r) => r.json()).then((d) => {
      if (d.error) setNotFound(true); else setData(d);
    });
  }, [domain]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch(`/api/site/${encodeURIComponent(domain)}/agent`).then((r) => r.json()).then(setAgent).catch(() => setAgent({ ok: false, error: 'unreachable' }));
  }, [domain]);

  async function reMeasure() {
    setBusy(true); setMsg('Measuring… (~30–90s)');
    try {
      const d = await fetch('/api/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: [domain], force: true }),
      }).then((r) => r.json());
      const r0 = d.results?.[0];
      setMsg(d.ok ? `Done — ${r0?.ok ?? 0}/2${r0?.notes?.length ? ` (${r0.notes.join('; ')})` : ''}` : (d.error || 'failed'));
      load();
    } catch { setMsg('Run failed.'); }
    setBusy(false);
  }

  // On-demand Lighthouse diagnosis — fresh PSI pull, does NOT touch the stored score/history.
  async function analyze(strategy: 'mobile' | 'desktop') {
    setDiagBusy(true); setDiagErr('');
    if (strategy !== diagStrategy) setDiag(null); // switching tabs: don't show the other form-factor's data while loading
    setDiagStrategy(strategy);
    try {
      const d = await fetch(`/api/site/${encodeURIComponent(domain)}/diagnose?strategy=${strategy}`).then((r) => r.json());
      if (d.error) { setDiagErr(d.error); setDiag(null); } else setDiag(d);
    } catch { setDiagErr('analysis failed'); }
    setDiagBusy(false);
  }

  if (notFound) return <p className="text-neutral-500">Unknown site. <Link href="/" className="text-blue-400 hover:underline">← Back</Link></p>;
  if (!data) return <p className="text-neutral-500">Loading…</p>;

  const m = data.latest.mobile, d = data.latest.desktop;
  const worst = Math.min(...[m?.perf_score, d?.perf_score].filter((x): x is number => x != null));
  const accent = Number.isFinite(worst) ? BAND_HEX[scoreBand(worst)] : '#3b82f6';

  // Server (WPE account) drives optimizer availability. NitroPack isn't offered on servers 4 & 5.
  const server = agent?.server ?? null;
  const nitroBlocked = server === 'amgclient4' || server === 'amgclient5';
  const diagOpen = !!(diag || diagBusy || diagErr);

  // Compact plugin state for the status strip.
  const pluginStat = (k: string) => {
    if (k === 'nitropack' && nitroBlocked) return { dot: 'bg-neutral-600', label: 'N/A', cls: 'text-neutral-500' };
    const p = agent?.ok ? agent.perf_plugins?.[k] : null;
    if (!p) return { dot: 'bg-neutral-700', label: '—', cls: 'text-neutral-600' };
    if (!p.installed) return { dot: 'bg-neutral-600', label: 'off', cls: 'text-neutral-500' };
    return p.active ? { dot: 'bg-green-400', label: 'on', cls: 'text-green-400' } : { dot: 'bg-yellow-400', label: 'idle', cls: 'text-yellow-400' };
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Title bar — name + icon actions, with a status strip below. Accent tinted by the worse score. */}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="h-1" style={{ background: accent }} />
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h1 className="truncate text-xl font-semibold tracking-tight">{data.site.name || data.site.domain}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={reMeasure} disabled={busy} title="Re-measure — refresh the stored score" className={ICON_BTN}><IconRefresh spin={busy} /></button>
            <button onClick={() => analyze(diagStrategy)} disabled={diagBusy} title={diagOpen ? 'Re-analyze' : 'Analyze — Lighthouse diagnosis'} className={ICON_BTN}><IconAnalyze /></button>
            <a href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`https://${data.site.domain}/`)}`} target="_blank" rel="noopener" title="Open in PageSpeed Insights" className={ICON_BTN}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={favicon('pagespeed.web.dev')} alt="PSI" width={18} height={18} />
            </a>
            {agent?.ok && agent.install && (
              <a href={`https://my.wpengine.com/installs/${encodeURIComponent(agent.install)}`} target="_blank" rel="noopener" title="WP Engine overview" className={ICON_BTN}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={favicon('wpengine.com')} alt="WPE" width={18} height={18} />
              </a>
            )}
            <Link href="/" title="Back to fleet" className={ICON_BTN}><IconBack /></Link>
          </div>
        </div>
        {/* Status strip */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-neutral-800 px-5 py-2.5 text-xs">
          <a href={`https://${data.site.domain}/`} target="_blank" rel="noopener" className="font-medium text-neutral-300 hover:text-white">{data.site.domain}</a>
          <span className="text-neutral-700">·</span>
          <span className="text-neutral-400" title="WPE account / server">🖥 {server ?? '—'}</span>
          <span className="text-neutral-700">·</span>
          {HEADLINE.map((k) => {
            const st = pluginStat(k);
            return (
              <span key={k} className="flex items-center gap-1.5" title={PLUGIN_LABEL[k]}>
                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                <span className="text-neutral-400">{PLUGIN_LABEL[k]}</span>
                <span className={st.cls}>{st.label}</span>
              </span>
            );
          })}
          <span className="ml-auto text-neutral-500" title={data.site.last_run ? new Date(data.site.last_run).toLocaleString() : ''}>last run {timeAgo(data.site.last_run)}</span>
        </div>
        {msg && <div className="border-t border-neutral-800 px-5 py-2 text-xs text-neutral-400">{msg}</div>}
      </div>

      {/* Diagnosis — hidden until Analyze (title bar) is clicked; Mobile/Desktop act as tabs. */}
      {diagOpen && (
        <div>
          <div className="flex items-center gap-1 border-b border-neutral-800">
            {(['desktop', 'mobile'] as const).map((s) => {
              const active = diagStrategy === s;
              return (
                <button key={s} onClick={() => analyze(s)} disabled={diagBusy}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium capitalize disabled:opacity-60 ${active ? 'border-blue-500 text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>
                  {s === 'desktop' ? <IconMonitor /> : <IconPhone />}{s}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 pr-1 text-xs text-neutral-500">
              {diagBusy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-700 border-t-blue-500" />}
              {diag && <span>Lighthouse <span className="font-semibold text-neutral-300">{diag.score ?? '—'}</span></span>}
            </div>
          </div>
          <div className="pt-3">
            {diagErr && <p className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{diagErr}</p>}
            {diagBusy && !diag && <Spinner label={`Analyzing ${diagStrategy}… (~30–90s)`} />}
            {diag && (
              <div className="space-y-3">
                {diag.opportunities.length > 0 && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Opportunities</h3>
                    <div className="space-y-2">
                      {diag.opportunities.map((o) => (
                        <div key={o.id} className="border-t border-neutral-800 pt-2 first:border-0 first:pt-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">{o.title}</span>
                            {o.savingsMs != null && <span className="shrink-0 rounded bg-amber-900/50 px-1.5 py-0.5 text-xs font-semibold text-amber-300">~{(o.savingsMs / 1000).toFixed(2)}s</span>}
                          </div>
                          {o.displayValue && <div className="text-xs text-neutral-500">{o.displayValue}</div>}
                          {o.fix && <div className="mt-0.5 text-xs text-blue-300">→ {o.fix}</div>}
                          {nitroBlocked && o.serverNote && <div className="text-xs text-amber-400/90">⚠ {o.serverNote}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {diag.diagnostics.length > 0 && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Diagnostics</h3>
                    <div className="space-y-2">
                      {diag.diagnostics.map((o) => (
                        <div key={o.id} className="border-t border-neutral-800 pt-2 first:border-0 first:pt-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">{o.title}</span>
                            {o.displayValue && <span className="shrink-0 text-xs text-neutral-400">{o.displayValue}</span>}
                          </div>
                          {o.fix && <div className="mt-0.5 text-xs text-blue-300">→ {o.fix}</div>}
                          {nitroBlocked && o.serverNote && <div className="text-xs text-amber-400/90">⚠ {o.serverNote}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {diag.opportunities.length === 0 && diag.diagnostics.length === 0 && (
                  <p className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-green-400">No significant opportunities — this page is well-optimized. 🎉</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <StrategyCard label="Mobile" run={m} />
        <StrategyCard label="Desktop" run={d} />
      </div>

      <TrendChart mob={data.history.mobile ?? []} desk={data.history.desktop ?? []} />

      {/* Activity log — reserved slot under score history; pick the exact feed later. */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h3 className="mb-1 text-sm font-semibold">Activity log</h3>
        <p className="text-sm text-neutral-600">Coming soon — a log of measurements, analyses, and score changes for this site.</p>
      </div>
    </div>
  );
}
