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
