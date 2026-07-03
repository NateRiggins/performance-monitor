import { createClient } from '@supabase/supabase-js';

// Service-role client for server-side DB access (API routes / cron). Bypasses RLS.
// NEVER import this into a client component.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env not configured (URL / SERVICE_ROLE_KEY)');
  return createClient(url, key, { auth: { persistSession: false } });
}
