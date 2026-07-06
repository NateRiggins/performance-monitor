import { supabaseAdmin } from '@/lib/supabase/admin';

export type ActivityEvent = 'scan' | 'remeasure' | 'analyze';

// Fire-and-forget activity logging for the detail-page feed. MUST never throw — a failed insert
// can't be allowed to break a measure / analyze / scan. `pm_activity` is service-role only.
export async function logActivity(row: {
  domain?: string | null;
  event: ActivityEvent;
  strategy?: string | null;
  score?: number | null;
  status?: 'ok' | 'error';
  source?: 'manual' | 'cron';
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin().from('pm_activity').insert({ status: 'ok', source: 'manual', ...row });
  } catch { /* logging must never break the request */ }
}
