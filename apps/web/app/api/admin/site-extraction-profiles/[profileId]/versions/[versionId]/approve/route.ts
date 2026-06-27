/**
 * POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve
 *
 * Atomically activate a profile version (approve).
 *
 * Requires:
 * - Admin-only auth (not staff — approval is sensitive)
 * - Profile version exists with status IN ('draft', 'validating')
 * - Version has compiled_crawl4ai_schema set
 * - If force=false (default): a passed validation run must exist
 * - approval_note is present, non-empty, and >= 10 characters
 *
 * Uses a PG RPC function activate_profile_version() to atomically:
 * 1. Retire the current active version (if any)
 * 2. Set target version to 'active' with approval metadata
 * 3. Update profile.active_version_id and profile.status = 'active'
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminOnlyAuth } from '@/lib/admin/api-auth';

interface RouteContext {
  params: Promise<{ profileId: string; versionId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  // 1. Admin-only auth (not staff)
  const auth = await requireAdminOnlyAuth(request);
  if (!auth.authorized) return auth.response;

  const { profileId, versionId } = await context.params;
  const supabase = await createAdminClient();

  // 2. Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const approvalNote = body.approval_note as string | undefined;

  // 3. Validate approval_note
  if (!approvalNote || typeof approvalNote !== 'string' || approvalNote.trim().length < 10) {
    return NextResponse.json(
      { error: 'approval_note is required and must be at least 10 characters' },
      { status: 400 },
    );
  }

  // 4. Load profile version
  const { data: version, error: versionError } = await supabase
    .from('site_extraction_profile_versions')
    .select('id, profile_id, version_number, status, compiled_crawl4ai_schema')
    .eq('id', versionId)
    .eq('profile_id', profileId)
    .single();

  if (versionError || !version) {
    return NextResponse.json({ error: 'Profile version not found' }, { status: 404 });
  }

  // 5. Validate version status
  if (!['draft', 'validating'].includes(version.status)) {
    return NextResponse.json(
      {
        error: `Version status must be 'draft' or 'validating' to approve, but is '${version.status}'`,
      },
      { status: 400 },
    );
  }

  // 6. Validate compiled_crawl4ai_schema exists
  if (!version.compiled_crawl4ai_schema) {
    return NextResponse.json(
      { error: 'Version has no compiled Crawl4AI schema. Generate a draft first.' },
      { status: 400 },
    );
  }

  // 7. Require the latest validation run to have passed
  const { data: latestValidationRun } = await supabase
    .from('profile_validation_runs')
    .select('id, status')
    .eq('profile_version_id', versionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestValidationRun || latestValidationRun.status !== 'passed') {
    return NextResponse.json(
      {
        error:
          'The most recent validation run must have passed before approving. ' +
          'Run validation first.',
      },
      { status: 400 },
    );
  }

  // 8. Call activate_profile_version RPC
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'activate_profile_version',
    {
      p_version_id: versionId,
      p_approved_by: auth.user.id,
      p_approval_note: approvalNote.trim(),
    },
  );

  if (rpcError) {
    console.error('[ApproveVersion] RPC failed:', rpcError);
    return NextResponse.json(
      { error: rpcError.message ?? 'Failed to activate profile version' },
      { status: 500 },
    );
  }

  // 9. Fetch the updated version and profile for the response
  const [updatedVersion, updatedProfile] = await Promise.all([
    supabase
      .from('site_extraction_profile_versions')
      .select('id, profile_id, version_number, status, approved_by, approved_at, approval_note')
      .eq('id', versionId)
      .single(),
    supabase
      .from('site_extraction_profiles')
      .select('id, status, active_version_id')
      .eq('id', profileId)
      .single(),
  ]);

  return NextResponse.json({
    success: true,
    activationResult: rpcResult,
    profileVersion: updatedVersion.data ?? null,
    profile: updatedProfile.data ?? null,
  });
}
