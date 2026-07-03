'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { band, scoreBand, type Band } from '@/lib/vitals';

type Run = {
  strategy: string; fetched_at: string; perf_score: number | null;
  lcp_ms: number | null; cls: number | null; tbt_ms: number | null; fcp_ms: number | null; si_ms: number | null;
  has_field: boolean; crux_lcp_ms: number | null; crux_inp_ms: number | null; crux_cls: number | null; crux_category: string | null;
};
type Data = { site: any; latest: Record<string, Run>; history: Record<string, Run[]> };
type PerfPlugin = { name: string; installed: boolean; active: boolean; version: string };
type AgentData =
  | { ok: true; install: string | null; agent: string | null; perf_plugins: Record<string, PerfPlugin> | null }
  | { ok: false; error: string }
  | null;
const HEADLINE = ['wp-rocket', 'shortpixel', 'nitropack'];

const tip = { contentStyle: { background: '#171717', border: '1px solid #404040', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#e5e5e5' } };
const fmtMs = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
const fmtCls = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3));
const bandCls = (b: Band) => b === 'good' ? 'text-green-400' : b === 'ni' ? 'text-yellow-400' : b === 'poor' ? 'text-red-400' : 'text-neutral-600';

function PluginCard({ pp }: { pp: PerfPlugin }) {
  const s = !pp.installed ? { label: 'Not installed', cls: 'text-neutral-500' }
    : pp.active ? { label: 'Active', cls: 'text-green-400' }
    : { label: 'Inactive', cls: 'text-yellow-400' };
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="text-sm font-semibold">{pp.name}</div>
      <div className={`mt-1 text-lg font-bold ${s.cls}`}>{s.label}</div>
      {pp.installed && pp.version && <div className="text-xs text-neutral-500">v{pp.version}</div>}
    </div>
  );
}

function ScoreBig({ s }: { s: number | null }) {
  const b = scoreBand(s);
  const c = b === 'good' ? 'text-green-400' : b === 'ni' ? 'text-yellow-400' : b === 'poor' ? 'text-red-400' : 'text-neutral-500';
  return <span className={`text-3xl font-bold ${c}`}>{s ?? '—'}</span>;
}

function StrategyPanel({ label, run, history }: { label: string; run?: Run; history: Run[] }) {
  if (!run) return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <h3 className="text-sm font-semibold">{label}</h3>
      <p className="mt-2 text-sm text-neutral-500">No run yet.</p>
    </div>
  );
  const chart = history.map((r) => ({ t: new Date(r.fetched_at).toLocaleDateString(), score: r.perf_score }));
  const rows: [string, string, Band][] = [
    ['LCP', fmtMs(run.has_field ? run.crux_lcp_ms : run.lcp_ms), band('lcp', run.has_field ? run.crux_lcp_ms : run.lcp_ms)],
    ['INP', run.has_field ? fmtMs(run.crux_inp_ms) : '— (lab n/a)', band('inp', run.has_field ? run.crux_inp_ms : null)],
    ['CLS', fmtCls(run.has_field ? run.crux_cls : run.cls), band('cls', run.has_field ? run.crux_cls : run.cls)],
    ['TBT (lab)', fmtMs(run.tbt_ms), 'na'],
    ['FCP (lab)', fmtMs(run.fcp_ms), 'na'],
    ['Speed Index (lab)', fmtMs(run.si_ms), 'na'],
  ];
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-neutral-500">{run.has_field ? <span className="text-green-400">field data{run.crux_category ? ` · ${run.crux_category}` : ''}</span> : 'lab only'}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2"><ScoreBig s={run.perf_score} /><span className="text-xs text-neutral-500">Lighthouse</span></div>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {rows.map(([k, v, b]) => (
            <tr key={k} className="border-t border-neutral-800">
              <td className="py-1 text-neutral-400">{k}</td>
              <td className={`py-1 text-right font-medium ${bandCls(b)}`}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {chart.length > 1 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-neutral-500">Score history</div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chart} margin={{ left: -20, right: 8, top: 4 }}>
              <CartesianGrid stroke="#262626" />
              <XAxis dataKey="t" tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip {...tip} />
              <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
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

  const load = useCallback(() => {
    fetch(`/api/site/${encodeURIComponent(domain)}`).then((r) => r.json()).then((d) => {
      if (d.error) setNotFound(true); else setData(d);
    });
  }, [domain]);
  useEffect(() => { load(); }, [load]);
  // Agent config (WPE install + perf plugins) — separate fetch so a slow Agent never blocks PSI data.
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

  if (notFound) return <p className="text-neutral-500">Unknown site. <Link href="/" className="text-blue-400 hover:underline">← Back</Link></p>;
  if (!data) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{data.site.name || data.site.domain}</h1>
          <div className="text-sm text-neutral-500">{data.site.domain} · last run {data.site.last_run ? new Date(data.site.last_run).toLocaleString() : 'never'}</div>
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
      {msg && <div className="text-xs text-neutral-400">{msg}</div>}
      {data.site.last_status && <div className="text-xs text-neutral-500">{data.site.last_status}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <StrategyPanel label="Mobile" run={data.latest.mobile} history={data.history.mobile ?? []} />
        <StrategyPanel label="Desktop" run={data.latest.desktop} history={data.history.desktop ?? []} />
      </div>

      {/* Optimization plugins — only when the Agent supports it (≥1.2.16); hidden otherwise. */}
      {agent?.ok && agent.perf_plugins && (() => {
        const pp = agent.perf_plugins!;
        const extras = Object.entries(pp).filter(([k, v]) => !HEADLINE.includes(k) && v.installed);
        return (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Optimization {agent.agent && <span className="font-normal text-neutral-500">· Agent {agent.agent}</span>}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {HEADLINE.map((k) => pp[k] && <PluginCard key={k} pp={pp[k]} />)}
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
          </div>
        );
      })()}
    </div>
  );
}
