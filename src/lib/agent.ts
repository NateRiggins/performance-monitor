// Read config from a site's AMG Agent (amg-bot-shield). Shared fleet token in AMG_BS_TOKEN
// (server env only — never exposed to the client). Used for the detail page's plugin cards.
const NS = 'wp-json/amg-bot-shield/v1';

export function agentConfigured(): boolean {
  return !!process.env.AMG_BS_TOKEN;
}
function authHeader(): Record<string, string> {
  const t = process.env.AMG_BS_TOKEN;
  if (!t) throw new Error('AMG_BS_TOKEN not configured');
  return { Authorization: `Bearer ${t}` };
}

export type PerfPlugin = { name: string; installed: boolean; active: boolean; version: string };
export type AgentSite =
  | { ok: true; install: string | null; agent: string | null; perf_plugins: Record<string, PerfPlugin> | null }
  | { ok: false; error: string };

const hostsFor = (domain: string) => {
  const h = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return h.startsWith('www.') ? [h] : [h, `www.${h}`];
};

// GET /site with the fleet token, trying bare then www. `perf_plugins` is present on
// Agent ≥1.2.16; older Agents return the field as null so the UI can hide the cards.
export async function getAgentSite(domain: string): Promise<AgentSite> {
  const headers = authHeader();
  let lastErr = 'unreachable';
  for (const h of hostsFor(domain)) {
    try {
      const r = await fetch(`https://${h}/${NS}/site`, { headers, signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'Agent rejected the token' };
      if (r.status === 404) { lastErr = 'no /site route (old Agent)'; continue; }
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
      const d = await r.json();
      return { ok: true, install: d.install || null, agent: d.agent || null, perf_plugins: d.perf_plugins ?? null };
    } catch (e: any) {
      lastErr = e?.name === 'TimeoutError' ? 'timed out' : 'unreachable';
    }
  }
  return { ok: false, error: lastErr };
}
