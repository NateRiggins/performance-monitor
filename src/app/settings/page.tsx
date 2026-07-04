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
    </div>
  );
}
