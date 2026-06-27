/**
 * POST /api/admin/site-extraction-profiles/[profileId]/workshop/save
 * Compiles selectors→rules→schema→hash, creates/updates single draft version.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createHash } from 'crypto';

interface Sel { field_name: string; selector: string; type: string; required?: boolean; attribute?: string }

export async function POST(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;
  const { profileId } = await params;
  let body: { selectors?: Sel[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { selectors } = body;
  if (!Array.isArray(selectors) || !selectors.length) return NextResponse.json({ error: 'selectors[] required' }, { status: 400 });

  // Compile rules + schema + hash
  const fields = selectors.map(s => ({ field_name: s.field_name, selector: s.selector, type: s.type || 'text', required: s.required ?? false, ...(s.attribute ? { attribute: s.attribute } : {}) }));
  const rules = { profile_version: 'v1', schema_version: '1', generated_from: 'selector_workshop', fields };
  const sf = fields.map(f => ({ name: f.field_name, selector: f.selector, type: f.type, ...(f.attribute ? { attribute: f.attribute } : {}) }));
  const schema = { name: 'Product extraction', baseSelector: 'body', fields: sf };
  const hash = createHash('sha256').update(JSON.stringify(rules, Object.keys(rules).sort()) + JSON.stringify(schema, Object.keys(schema).sort())).digest('hex');

  const supabase = await createAdminClient();
  const { data: draft } = await supabase.from('site_extraction_profile_versions').select('id,version_number').eq('profile_id', profileId).eq('status', 'draft').order('version_number', { ascending: false }).limit(1).maybeSingle();

  if (draft) {
    await supabase.from('site_extraction_profile_versions').update({ rules, compiled_crawl4ai_schema: schema, version_hash: hash, updated_at: new Date().toISOString() }).eq('id', draft.id).eq('status', 'draft');
    return NextResponse.json({ version: { id: draft.id, version_number: draft.version_number, status: 'draft', version_hash: hash, created_from: 'manual' }, updated: true });
  }

  const { data: latest } = await supabase.from('site_extraction_profile_versions').select('version_number').eq('profile_id', profileId).order('version_number', { ascending: false }).limit(1).maybeSingle();
  const vn = (latest?.version_number ?? 0) + 1;
  const { data: nv, error } = await supabase.from('site_extraction_profile_versions').insert({ profile_id: profileId, version_number: vn, status: 'draft', rules, compiled_crawl4ai_schema: schema, version_hash: hash, created_from: 'manual' }).select('id,version_number,status,version_hash,created_from,created_at').single();
  if (error || !nv) return NextResponse.json({ error: 'Failed to create version' }, { status: 500 });
  return NextResponse.json({ version: { id: nv.id, version_number: nv.version_number, status: nv.status, version_hash: nv.version_hash, created_from: nv.created_from, created_at: nv.created_at }, created: true });
}
