'use client';
import { useEffect, useState } from 'react';

type Site = { domain: string; name: string; include: boolean; last_run: string | null; last_status: string | null };
type Data = { sites: Site[]; has_key: boolean; last_site_refresh: string };

export default function Settings() {
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = () => fetch('/api/sites').then((r) => r.json()).then(setData);
  useEffect(() => { load(); }, []);

  async function refresh() {
    setBusy(true); setMsg('Seeding sites from client domains…');
    try {
      const d = await fetch('/api/sites/refresh', { method: 'POST' }).then((r) => r.json());
      setMsg(d.ok ? `Seeded — ${d.total} sites (skips "AUDIT -" sales audits).` : `Failed: ${d.error || 'unknown'}`);
      await load();
    } catch { setMsg('Refresh failed.'); }
    setBusy(false);
  }

  async function toggle(domain: string, include: boolean) {
    setData((d) => d ? { ...d, sites: d.sites.map((s) => s.domain === domain ? { ...s, include } : s) } : d);
    await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, include }) });
  }

  if (!data) return <p className="text-neutral-500">Loading…</p>;
  const sites = data.sites.filter((s) => `${s.name} ${s.domain}`.toLowerCase().includes(q.trim().toLowerCase()));
  const included = data.sites.filter((s) => s.include).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-400">Seed the fleet from client domains and choose which sites are measured.</p>
      </header>
      {!data.has_key && <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm">No <code>PAGESPEED_API_KEY</code> set — runs will be heavily rate-limited.</div>}

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Sites</h2>
            <p className="text-xs text-neutral-500">{included} of {data.sites.length} included in runs{data.last_site_refresh ? ` · seeded ${new Date(data.last_site_refresh).toLocaleString()}` : ''}</p>
          </div>
          <button onClick={refresh} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-60">
            {busy ? 'Seeding…' : 'Refresh sites from clients'}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-neutral-400">{msg}</p>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
          className="mt-3 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none focus:border-neutral-500" />
        <div className="mt-2 max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {sites.map((s) => (
                <tr key={s.domain} className="border-t border-neutral-800">
                  <td className="py-1.5 pr-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={s.include} onChange={(e) => toggle(s.domain, e.target.checked)} />
                      <span>{s.name || s.domain}<span className="ml-2 text-xs text-neutral-500">{s.domain}</span></span>
                    </label>
                  </td>
                  <td className="py-1.5 text-right text-xs text-neutral-500">{s.last_run ? new Date(s.last_run).toLocaleDateString() : 'never'}</td>
                </tr>
              ))}
              {sites.length === 0 && <tr><td className="py-3 text-neutral-500">No sites. Click “Refresh sites from clients”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <RecsEditor />
    </div>
  );
}

type Rec = { audit_id: string; tool: string | null; recommendation: string; server_note: string | null };

function RecsEditor() {
  const [rows, setRows] = useState<Rec[] | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [savingId, setSavingId] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [neu, setNeu] = useState<Rec>({ audit_id: '', tool: 'other', recommendation: '', server_note: '' });

  const load = () => fetch('/api/recommendations').then((r) => r.json()).then((d) => { setRows(d.rows || []); setTools(d.tools || []); });
  useEffect(() => { load(); }, []);

  const edit = (id: string, patch: Partial<Rec>) => setRows((rs) => rs ? rs.map((r) => r.audit_id === id ? { ...r, ...patch } : r) : rs);

  async function save(r: Rec) {
    setSavingId(r.audit_id); setMsg('');
    const d = await fetch('/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }).then((x) => x.json());
    setSavingId('');
    setMsg(d.success ? `Saved ${r.audit_id}` : (d.error || 'save failed'));
    return d.success;
  }
  async function addNew() {
    if (!neu.audit_id.trim() || !neu.recommendation.trim()) { setMsg('audit_id + recommendation required'); return; }
    if (await save(neu)) { setNeu({ audit_id: '', tool: 'other', recommendation: '', server_note: '' }); load(); }
  }
  async function remove(id: string) {
    if (!confirm(`Delete the recommendation for ${id}?`)) return;
    await fetch(`/api/recommendations?audit_id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  const toolSel = (val: string | null, on: (v: string) => void) => (
    <select value={val ?? ''} onChange={(e) => on(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs">
      <option value="">—</option>
      {tools.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
  const inp = (v: string, on: (s: string) => void, ph = '') => (
    <input value={v} onChange={(e) => on(e.target.value)} placeholder={ph} className="w-full rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs outline-none focus:border-neutral-500" />
  );

  if (!rows) return <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">Loading recommendations…</div>;
  const filtered = rows.filter((r) => `${r.audit_id} ${r.recommendation}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Recommendations <span className="font-normal text-neutral-500">({rows.length})</span></h2>
          <p className="text-xs text-neutral-500">Lighthouse audit → AMG-stack fix shown in each site&apos;s Diagnosis panel. Edits apply within ~5 min.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-40 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs" />
      </div>
      {msg && <p className="mt-2 text-xs text-neutral-400">{msg}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="py-1 pr-2">Audit</th><th className="py-1 pr-2">Tool</th><th className="py-1 pr-2 w-[36%]">Recommendation</th><th className="py-1 pr-2 w-[28%]">Server 4/5 note</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.audit_id} className="border-t border-neutral-800 align-top">
                <td className="py-1.5 pr-2 font-mono text-xs text-neutral-400">{r.audit_id}</td>
                <td className="py-1.5 pr-2">{toolSel(r.tool, (v) => edit(r.audit_id, { tool: v || null }))}</td>
                <td className="py-1.5 pr-2">{inp(r.recommendation, (v) => edit(r.audit_id, { recommendation: v }))}</td>
                <td className="py-1.5 pr-2">{inp(r.server_note ?? '', (v) => edit(r.audit_id, { server_note: v }))}</td>
                <td className="py-1.5 whitespace-nowrap">
                  <button onClick={() => save(r)} disabled={savingId === r.audit_id} className="rounded bg-blue-600 px-2 py-1 text-xs font-medium hover:bg-blue-500 disabled:opacity-60">{savingId === r.audit_id ? '…' : 'Save'}</button>
                  <button onClick={() => remove(r.audit_id)} title="Delete" aria-label="Delete" className="ml-1 rounded border border-neutral-700 px-2 py-1 text-xs text-red-400 hover:bg-neutral-800">✕</button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-neutral-700 align-top">
              <td className="py-1.5 pr-2">{inp(neu.audit_id, (v) => setNeu({ ...neu, audit_id: v }), 'new-audit-id')}</td>
              <td className="py-1.5 pr-2">{toolSel(neu.tool, (v) => setNeu({ ...neu, tool: v }))}</td>
              <td className="py-1.5 pr-2">{inp(neu.recommendation, (v) => setNeu({ ...neu, recommendation: v }), 'fix text')}</td>
              <td className="py-1.5 pr-2">{inp(neu.server_note ?? '', (v) => setNeu({ ...neu, server_note: v }), 'optional')}</td>
              <td className="py-1.5"><button onClick={addNew} className="rounded bg-green-700 px-2 py-1 text-xs font-medium hover:bg-green-600">Add</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
