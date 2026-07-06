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

function PluginCard({ pp, unavailable, note }: { pp: PerfPlugin; unavailable?: boolean; note?: string }) {
  // Unavailable = this optimizer can't run on the site's server (e.g. NitroPack on servers 4/5),
  // so we never present it as a to-do "Not installed".
  if (unavailable) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-neutral-700" />{pp.name}</div>
        <div className="mt-1 text-lg font-bold text-neutral-500">Not available</div>
        {note && <div className="text-xs text-amber-500/90">{note}</div>}
      </div>
    );
  }
  const s = !pp.installed ? { label: 'Not installed', cls: 'text-neutral-500', dot: 'bg-neutral-600' }
    : pp.active ? { label: 'Active', cls: 'text-green-400', dot: 'bg-green-400' }
    : { label: 'Inactive', cls: 'text-yellow-400', dot: 'bg-yellow-400' };
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${s.dot}`} />{pp.name}</div>
      <div className={`mt-1 text-lg font-bold ${s.cls}`}>{s.label}</div>
      {pp.installed && pp.version && <div className="text-xs text-neutral-500">v{pp.version}</div>}
    </div>
  );
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
  const [diagStrategy, setDiagStrategy] = useState<'mobile' | 'desktop'>('mobile');
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
    setDiagBusy(true); setDiagErr(''); setDiagStrategy(strategy);
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

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Header with an accent bar tinted by the worse of the two scores */}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="h-1" style={{ background: accent }} />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{data.site.name || data.site.domain}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-neutral-500">
              <span>{data.site.domain}</span>
              {server && <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300" title="WPE account / server">🖥 {server}</span>}
              <span>· last run {data.site.last_run ? new Date(data.site.last_run).toLocaleString() : 'never'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button onClick={reMeasure} disabled={busy}
              className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500 disabled:opacity-60">
              {busy ? 'Measuring…' : 'Re-measure'}
            </button>
            {agent?.ok && agent.install && (
              <a href={`https://my.wpengine.com/installs/${encodeURIComponent(agent.install)}`} target="_blank" rel="noopener"
                className="rounded border border-neutral-700 px-3 py-1.5 font-medium text-neutral-200 hover:border-neutral-500">WPE Overview ↗</a>
            )}
            <a href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`https://${data.site.domain}/`)}`} target="_blank" rel="noopener" className="text-blue-400 hover:underline">Open in PSI ↗</a>
            <Link href="/" className="text-neutral-400 hover:text-white">← Back</Link>
          </div>
        </div>
        {msg && <div className="px-5 pb-3 text-xs text-neutral-400">{msg}</div>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StrategyCard label="Mobile" run={m} />
        <StrategyCard label="Desktop" run={d} />
      </div>

      <TrendChart mob={data.history.mobile ?? []} desk={data.history.desktop ?? []} />

      {/* Optimization — always rendered once the Agent check resolves, with a clear status. */}
      {agent && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Optimization
            {agent.ok && agent.agent && <span className="font-normal text-neutral-500"> · Agent {agent.agent}</span>}
          </h2>
          {!agent.ok ? (
            <p className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-500">AMG Agent not reachable on this site ({agent.error}) — plugin status unavailable.</p>
          ) : !agent.perf_plugins ? (
            <p className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-500">This site&apos;s Agent (v{agent.agent}) predates plugin reporting. Update to <span className="text-neutral-300">≥1.2.16</span> to see WP Rocket / ShortPixel / NitroPack status.</p>
          ) : (() => {
            const pp = agent.perf_plugins!;
            const extras = Object.entries(pp).filter(([k, v]) => !HEADLINE.includes(k) && v.installed);
            return (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {HEADLINE.map((k) => {
                    const blocked = k === 'nitropack' && nitroBlocked;
                    const p = pp[k];
                    if (!p && !blocked) return null;
                    return (
                      <PluginCard
                        key={k}
                        pp={p ?? { name: 'NitroPack', installed: false, active: false, version: '' }}
                        unavailable={blocked}
                        note={blocked ? `Not offered on ${server}` : undefined}
                      />
                    );
                  })}
                </div>
                {extras.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {extras.map(([k, v]) => (
                      <span key={k} className="rounded border border-neutral-700 px-2 py-1 text-neutral-300">
                        {v.name}: <span className={v.active ? 'text-green-400' : 'text-neutral-500'}>{v.active ? 'active' : 'inactive'}</span>{v.version ? ` v${v.version}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Diagnosis — on-demand fresh Lighthouse pull (free); does not touch the stored score. */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Diagnosis
            {diag && <span className="font-normal text-neutral-500"> · {diag.strategy} · Lighthouse {diag.score ?? '—'}</span>}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
              {(['mobile', 'desktop'] as const).map((s) => (
                <button key={s} onClick={() => analyze(s)} disabled={diagBusy}
                  className={`px-2 py-1 ${diag && diag.strategy === s ? 'bg-neutral-700 text-white' : 'text-neutral-300 hover:bg-neutral-800'}`}>{s}</button>
              ))}
            </div>
            <button onClick={() => analyze(diagStrategy)} disabled={diagBusy}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
              {diagBusy ? 'Analyzing…' : diag ? 'Re-analyze' : 'Analyze'}
            </button>
          </div>
        </div>
        {diagErr && <p className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{diagErr}</p>}
        {!diag && !diagBusy && !diagErr && (
          <p className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-500">
            Run a fresh Lighthouse analysis to see opportunities &amp; diagnostics, each mapped to a WP Rocket / NitroPack / ShortPixel fix. Free, and separate from Re-measure — it doesn&apos;t change the stored score.
          </p>
        )}
        {diagBusy && !diag && <p className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-500">Analyzing… (~30–90s)</p>}
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
  );
}
