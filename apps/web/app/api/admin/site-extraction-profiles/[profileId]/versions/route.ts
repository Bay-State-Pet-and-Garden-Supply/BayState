/**
 * GET /api/admin/site-extraction-profiles/[profileId]/versions
 *
 * List all versions for a profile, ordered by version_number descending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;
  const { profileId } = await params;
  const supabase = await createAdminClient();
  const { data: versions, error } = await supabase
    .from('site_extraction_profile_versions')
    .select('id, profile_id, version_number, status, version_hash, created_from, created_at, updated_at, approved_at')
    .eq('profile_id', profileId).order('version_number', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 });
  return NextResponse.json({ versions: versions ?? [] });
}
