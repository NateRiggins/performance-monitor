import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const TOOLS = ['wp-rocket', 'nitropack', 'shortpixel', 'wpe', 'theme', 'other'];

// The curated Lighthouse-audit → AMG-stack recommendations, editable from Settings. diagnose.ts reads
// this table (5-min cache) to annotate the Diagnosis panel. Service-role only — never exposed client-side.
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('pm_recommendations')
    .select('audit_id,tool,recommendation,server_note,severity,notes,updated_at')
    .order('audit_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [], tools: TOOLS });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const audit_id = String(b.audit_id ?? '').trim();
  if (!audit_id) return NextResponse.json({ error: 'audit_id required' }, { status: 400 });
  const recommendation = String(b.recommendation ?? '').trim();
  if (!recommendation) return NextResponse.json({ error: 'recommendation required' }, { status: 400 });
  const row = {
    audit_id,
    tool: b.tool && TOOLS.includes(b.tool) ? b.tool : null,
    recommendation,
    server_note: (b.server_note ?? '').toString().trim() || null,
    severity: b.severity ? String(b.severity).trim() : null,
    notes: b.notes ? String(b.notes).trim() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin().from('pm_recommendations').upsert(row, { onConflict: 'audit_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const audit_id = new URL(req.url).searchParams.get('audit_id') ?? '';
  if (!audit_id) return NextResponse.json({ error: 'audit_id required' }, { status: 400 });
  const { error } = await supabaseAdmin().from('pm_recommendations').delete().eq('audit_id', audit_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
