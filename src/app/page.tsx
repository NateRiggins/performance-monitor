'use client';
import { memo, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { band, scoreBand, BAND_HEX, type Band } from '@/lib/vitals';

type Metric = {
  perf_score: number | null; lcp_ms: number | null; cls: number | null; tbt_ms: number | null;
  has_field: boolean; crux_lcp_ms: number | null; crux_inp_ms: number | null; crux_cls: number | null; crux_category: string | null;
} | null;
type Row = { domain: string; name: string; last_run: string | null; last_status: string | null; mobile: Metric; desktop: Metric };
type Data = { cards: any; rows: Row[]; has_key: boolean; last_run: string };

const PSI = (domain: string) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`https://${domain}/`)}`;
const tip = { contentStyle: { background: '#171717', border: '1px solid #404040', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#e5e5e5' } };
const axisTick = { fill: '#737373', fontSize: 11 };

// Field metric if the origin has CrUX data, else fall back to the Lighthouse lab number.
const lcpOf = (m: Metric) => (m?.has_field ? m.crux_lcp_ms : m?.lcp_ms ?? null);
const clsOf = (m: Metric) => (m?.has_field ? m.crux_cls : m?.cls ?? null);
const inpOf = (m: Metric) => (m?.has_field ? m.crux_inp_ms : null); // INP is field-only

const fmtMs = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);
const fmtCls = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2));

function Score({ s }: { s: number | null | undefined }) {
  if (s == null) return <span className="text-neutral-600">—</span>;
  const b = scoreBand(s);
  const cls = b === 'good' ? 'bg-green-900/60 text-green-300' : b === 'ni' ? 'bg-yellow-900/60 text-yellow-300' : 'bg-red-900/60 text-red-300';
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>{s}</span>;
}
function Vital({ v, b }: { v: string; b: Band }) {
  const c = b === 'good' ? 'text-green-400' : b === 'ni' ? 'text-yellow-400' : b === 'poor' ? 'text-red-400' : 'text-neutral-600';
  return <span className={c}>{v}</span>;
}

// Charts depend only on the full row set, not on search/sort/filter. Memoized so those
// interactions never re-render Recharts (the expensive part) — keeps input delay low.
const Charts = memo(function Charts({ rows }: { rows: Row[] }) {
  const distFor = (pick: (r: Row) => number | null | undefined) =>
    (['good', 'ni', 'poor'] as Band[]).map((b) => ({
      name: b === 'good' ? 'Pass' : b === 'ni' ? 'Needs work' : 'Critical',
      value: rows.filter((r) => scoreBand(pick(r)) === b).length, fill: BAND_HEX[b],
    })).filter((d) => d.value > 0);
  const distMobile = distFor((r) => r.mobile?.perf_score);
  const distDesktop = distFor((r) => r.desktop?.perf_score);
  const worst = rows.filter((r) => r.mobile?.perf_score != null).sort((a, b) => a.mobile!.perf_score! - b.mobile!.perf_score!).slice(0, 8)
    .map((r) => ({ name: (r.name || r.domain).slice(0, 22), score: r.mobile!.perf_score, fill: BAND_HEX[scoreBand(r.mobile!.perf_score)] }));
  const donut = (title: string, d: { name: string; value: number; fill: string }[]) => {
    const total = d.reduce((a, x) => a + x.value, 0);
    return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {d.length === 0 ? <p className="text-sm text-neutral-500">No data.</p> : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={d} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={2}>
              {d.map((x, i) => <Cell key={i} fill={x.fill} stroke="#171717" />)}
            </Pie>
            {/* Hover shows each slice's share of the total (e.g. 45% of sites are Good). */}
            <Tooltip {...tip} formatter={(v: any, n: any) => [`${total ? Math.round((Number(v) / total) * 100) : 0}% of sites`, n]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
    );
  };
  return (
    <div className="grid gap-3 lg:grid-cols-4">
      {donut('Desktop score distribution', distDesktop)}
      {donut('Mobile score distribution', distMobile)}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 lg:col-span-2">
        <h3 className="mb-3 text-sm font-semibold">Lowest mobile scores</h3>
        {worst.length === 0 ? <p className="text-sm text-neutral-500">No data.</p> : (
          <ResponsiveContainer width="100%" height={Math.max(160, worst.length * 30)}>
            <BarChart data={worst} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid stroke="#262626" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={axisTick} width={150} axisLine={false} tickLine={false} />
              <Tooltip {...tip} cursor={{ fill: '#ffffff10' }} formatter={(v: any) => [v, 'Mobile']} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>{worst.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [sortCol, setSortCol] = useState('mscore');
  const [sortDir, setSortDir] = useState(1);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/dashboard').then((r) => r.json()).then(setData);
  useEffect(() => { load(); }, []);
  // Debounce search so the 271-row filter/sort recomputes after typing stops, not per keystroke.
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 200); return () => clearTimeout(t); }, [search]);

  const rows = useMemo(() => {
    if (!data) return [];
    let rs = data.rows.slice();
    if (filter) rs = rs.filter((r) => scoreBand(r.mobile?.perf_score) === filter);
    const q = debouncedSearch.trim().toLowerCase();
    if (q) rs = rs.filter((r) => `${r.name ?? ''} ${r.domain ?? ''}`.toLowerCase().includes(q));
    const key = (r: Row) => sortCol === 'mscore' ? r.mobile?.perf_score
      : sortCol === 'dscore' ? r.desktop?.perf_score
      : sortCol === 'name' ? (r.name || r.domain)
      : r.last_run;
    rs.sort((a, b) => {
      const av = key(a), bv = key(b);
      if (typeof av === 'number' || typeof bv === 'number') {
        const an = av == null ? (sortDir > 0 ? Infinity : -Infinity) : (av as number);
        const bn = bv == null ? (sortDir > 0 ? Infinity : -Infinity) : (bv as number);
        return (an - bn) * sortDir;
      }
      return String(av ?? '').localeCompare(String(bv ?? '')) * sortDir;
    });
    return rs;
  }, [data, sortCol, sortDir, filter, debouncedSearch]);

  function clickCol(c: string) {
    if (c === sortCol) setSortDir(-sortDir);
    else { setSortCol(c); setSortDir(c === 'name' ? 1 : -1); }
  }

  async function sync() {
    setBusy(true); setMsg('Running PageSpeed… (oldest sites first; large fleets run in batches)');
    try {
      const d = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json());
      setMsg(d.ok ? `Ran ${d.ran} site(s)${d.skipped_remaining ? `, ${d.skipped_remaining} left (batched)` : ''}.` : (d.error || 'failed'));
    } catch { setMsg('Run failed.'); }
    setBusy(false);
    load();
  }

  if (!data) return <p className="text-neutral-500">Loading…</p>;
  const c = data.cards;
  const card = (n: any, l: string) => (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="text-xl font-bold tabular-nums">{n}</div>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{l}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance Monitor</h1>
          <p className="mt-1 text-sm text-neutral-400">PageSpeed &amp; Core Web Vitals across the fleet.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={sync} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-60">Run now</button>
        </div>
      </header>
      {!data.has_key && <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm">No PageSpeed API key — add <code>PAGESPEED_API_KEY</code> (runs are heavily rate-limited without one). Then seed sites in Settings.</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-neutral-500">{data.last_run ? `Last run: ${new Date(data.last_run).toLocaleString()}` : 'Never run'}</span>
        <span className="text-xs text-neutral-400">{msg}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {card(c.sites, 'Sites')}{card(c.measured, 'Measured')}{card(c.avg_mobile == null ? '—' : c.avg_mobile, 'Avg mobile')}{card(c.poor_mobile, 'Critical mobile (<60)')}{card(c.field_coverage, 'Have field data')}
      </div>
      <Charts rows={data.rows} />
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Sites <span className="font-normal text-neutral-500">({rows.length})</span></h2>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sites…"
              className="w-52 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-neutral-500" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs">
              <option value="">All</option><option value="good">Pass</option><option value="ni">Needs work</option><option value="poor">Critical</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="w-8 px-2 py-1">#</th>
                <th onClick={() => clickCol('name')} className="cursor-pointer select-none px-2 py-1">Site{sortCol === 'name' ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>
                <th onClick={() => clickCol('dscore')} className="cursor-pointer select-none px-2 py-1">Desktop{sortCol === 'dscore' ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>
                <th onClick={() => clickCol('mscore')} className="cursor-pointer select-none px-2 py-1">Mobile{sortCol === 'mscore' ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>
                <th className="px-2 py-1">LCP</th><th className="px-2 py-1">INP</th><th className="px-2 py-1">CLS</th><th className="px-2 py-1" title="Total Blocking Time (Lighthouse lab)">TBT</th>
                <th onClick={() => clickCol('last')} className="cursor-pointer select-none px-2 py-1">Last run{sortCol === 'last' ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-neutral-500">No sites{data.rows.length ? ' match this filter.' : ' yet — seed them in Settings, then Run now.'}</td></tr>}
              {rows.map((r, i) => {
                const m = r.mobile;
                return (
                  <tr key={r.domain} className="border-t border-neutral-800">
                    <td className="px-2 py-1 text-neutral-500">{i + 1}</td>
                    <td className="px-2 py-1">
                      <Link href={`/site/${encodeURIComponent(r.domain)}`} className="text-blue-400 hover:underline">{r.name || r.domain}</Link>{' '}
                      <a href={PSI(r.domain)} target="_blank" rel="noopener" title="Open in PageSpeed Insights" className="text-neutral-500">↗</a>
                      <div className="text-xs text-neutral-500">{r.domain}</div>
                    </td>
                    <td className="px-2 py-1"><Score s={r.desktop?.perf_score} /></td>
                    <td className="px-2 py-1"><Score s={m?.perf_score} /></td>
                    <td className="px-2 py-1"><Vital v={fmtMs(lcpOf(m))} b={band('lcp', lcpOf(m))} /></td>
                    <td className="px-2 py-1"><Vital v={fmtMs(inpOf(m))} b={band('inp', inpOf(m))} /></td>
                    <td className="px-2 py-1"><Vital v={fmtCls(clsOf(m))} b={band('cls', clsOf(m))} /></td>
                    <td className="px-2 py-1"><Vital v={fmtMs(m?.tbt_ms)} b={band('tbt', m?.tbt_ms)} /></td>
                    <td className="px-2 py-1 text-neutral-500">{r.last_run ? new Date(r.last_run).toLocaleDateString() : 'never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-600">LCP/INP/CLS show real-user <span className="text-green-400">field</span> data when available, else <span className="text-neutral-400">lab</span>. INP is field-only; TBT is lab.</p>
      </div>
    </div>
  );
}
