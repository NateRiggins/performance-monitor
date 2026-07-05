import { supabaseAdmin } from '@/lib/supabase/admin';

// Sales audits are named "AUDIT - <site>" — not real client sites, skip them at seed time.
const isSalesAudit = (name: string | null) => /^\s*audit\s*-/i.test(name ?? '');

export const normDomain = (d: string | null) =>
  (d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

// Seed / refresh pm_sites from the existing client domains in hm_projects.
// Upserts domain+name only, so an existing row keeps its include flag + last_run.
export async function refreshSites(): Promise<{ added: number; total: number }> {
  const db = supabaseAdmin();
  const { data } = await db.from('hm_projects').select('name,domain');
  const seen = new Set<string>();
  const rows: { domain: string; name: string }[] = [];
  for (const p of data ?? []) {
    if (isSalesAudit(p.name)) continue;
    const domain = normDomain(p.domain);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    rows.push({ domain, name: p.name ?? domain });
  }
  if (rows.length) await db.from('pm_sites').upsert(rows, { onConflict: 'domain' });
  await db.from('pm_settings').upsert({ key: 'last_site_refresh', value: new Date().toISOString() });
  const { count } = await db.from('pm_sites').select('*', { count: 'exact', head: true });
  return { added: rows.length, total: count ?? rows.length };
}

// The WPE account/server a domain runs on (e.g. "amgclient4"), from the shared fleet audit that
// Command Center maintains. Surfaced on the detail page so you can see the server before trying an
// optimizer — e.g. NitroPack isn't available on servers 4 & 5. Returns null if the site isn't in
// the fleet audit yet.
export async function lookupServer(domain: string): Promise<string | null> {
  const d = normDomain(domain);
  const { data } = await supabaseAdmin()
    .from('cc_fleet_audit')
    .select('domain, account')
    .in('domain', [d, `www.${d}`]);
  const rows = data ?? [];
  const row = rows.find((r) => r.account) ?? rows[0];
  return (row?.account as string | undefined) ?? null;
}
