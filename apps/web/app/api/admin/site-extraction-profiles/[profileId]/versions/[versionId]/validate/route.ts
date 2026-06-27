/**
 * POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate
 *
 * Enqueue a validate_profile_version job for a profile version.
 *
 * Requires:
 * - Admin auth (admin or staff)
 * - Profile version exists with status IN ('draft', 'rejected')
 * - Version has compiled_crawl4ai_schema set
 * - A validation set exists (auto-create from verified seeds if none)
 * - No in-flight validation run exists for this version
 *
 * Returns 202 with job + validationRun + cases.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface RouteContext {
  params: Promise<{ profileId: string; versionId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  // 1. Admin auth
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { profileId, versionId } = await context.params;
  const supabase = await createAdminClient();

  // 2. Parse optional body
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine
  }

  // 3. Load profile version with profile scope
  const { data: version, error: versionError } = await supabase
    .from('site_extraction_profile_versions')
    .select('id, profile_id, version_number, status, rules, compiled_crawl4ai_schema, version_hash')
    .eq('id', versionId)
    .eq('profile_id', profileId)
    .single();

  if (versionError || !version) {
    return NextResponse.json({ error: 'Profile version not found' }, { status: 404 });
  }

  // 4. Validate version status
  if (!['draft', 'rejected'].includes(version.status)) {
    return NextResponse.json(
      { error: `Version status must be 'draft' or 'rejected' to validate, but is '${version.status}'` },
      { status: 400 },
    );
  }

  // 5. Validate compiled_crawl4ai_schema exists
  if (!version.compiled_crawl4ai_schema) {
    return NextResponse.json(
      { error: 'Version has no compiled Crawl4AI schema. Generate a draft first.' },
      { status: 400 },
    );
  }

  // 6. Resolve validation set — use provided set_id or find the most recent one
  let validationSetId: string | null = (body.validation_set_id as string) || null;

  if (validationSetId) {
    // Caller provided a set_id — verify it belongs to this profile
    const { data: providedSet } = await supabase
      .from('profile_validation_sets')
      .select('id, profile_id')
      .eq('id', validationSetId)
      .maybeSingle();

    if (!providedSet) {
      return NextResponse.json(
        { error: 'Validation set not found' },
        { status: 404 },
      );
    }

    if (providedSet.profile_id !== profileId) {
      return NextResponse.json(
        { error: 'Validation set does not belong to this profile' },
        { status: 400 },
      );
    }
  } else {
    const { data: existingSet } = await supabase
      .from('profile_validation_sets')
      .select('id')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    validationSetId = existingSet?.id ?? null;
  }

  if (!validationSetId) {
    return NextResponse.json(
      {
        error:
          'No validation set exists for this profile. ' +
          'Verify at least one PDP seed to auto-create validation cases, or create a validation set manually.',
      },
      { status: 400 },
    );
  }

  // 7. Check for in-flight validation runs
  const nonTerminalRunStatuses = ['pending', 'running'];
  const { data: existingRun } = await supabase
    .from('profile_validation_runs')
    .select('id, status')
    .eq('profile_version_id', versionId)
    .in('status', nonTerminalRunStatuses)
    .limit(1)
    .maybeSingle();

  if (existingRun) {
    return NextResponse.json(
      {
        error: 'A validation run is already in progress for this version',
        existingValidationRun: { id: existingRun.id, status: existingRun.status },
      },
      { status: 409 },
    );
  }

  // 8. Fetch validation cases for the set
  const { data: validationCases } = await supabase
    .from('profile_validation_cases')
    .select('id, case_type, target_url, expected_assertions')
    .eq('validation_set_id', validationSetId);

  const cases = (validationCases ?? []) as Array<{
    id: string;
    case_type: string;
    target_url: string;
    expected_assertions: Record<string, unknown>;
  }>;

  if (cases.length === 0) {
    return NextResponse.json(
      { error: 'Validation set has no cases. At least one validation case is required.' },
      { status: 400 },
    );
  }

  // 9. Create validation run record
  const { data: validationRun, error: runError } = await supabase
    .from('profile_validation_runs')
    .insert({
      profile_version_id: versionId,
      validation_set_id: validationSetId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (runError || !validationRun) {
    console.error('[ValidateVersion] Failed to create validation run:', runError);
    return NextResponse.json({ error: 'Failed to create validation run' }, { status: 500 });
  }

  // 10. Update version status to validating
  await supabase
    .from('site_extraction_profile_versions')
    .update({ status: 'validating', updated_at: new Date().toISOString() })
    .eq('id', versionId);

  // 11. Enqueue validate_profile_version job with cases embedded in payload
  const jobPayload = {
    profile_version_id: versionId,
    profile_id: profileId,
    validation_set_id: validationSetId,
    validation_run_id: validationRun.id,
    compiled_crawl4ai_schema: version.compiled_crawl4ai_schema,
    rules: version.rules,
    validation_cases: cases.map((c) => ({
      id: c.id,
      case_type: c.case_type,
      target_url: c.target_url,
      expected_assertions: c.expected_assertions,
    })),
  };

  const requiredCapabilities = [
    'profile_maintenance',
    'profile_maintenance.validate_profile_version',
    'profile_maintenance.crawl4ai',
  ];

  const { data: job, error: jobError } = await supabase
    .from('profile_maintenance_jobs')
    .insert({
      kind: 'validate_profile_version',
      status: 'queued',
      brand_id: undefined, // Will be fetched from profile
      source_slug: undefined,
      canonical_domain: undefined,
      profile_id: profileId,
      profile_version_id: versionId,
      payload: jobPayload,
      required_capabilities: requiredCapabilities,
      max_attempts: 2,
      attempt_count: 0,
    })
    .select('id, kind, status, created_at')
    .single();

  if (jobError) {
    console.error('[ValidateVersion] Failed to enqueue validation job:', jobError);
    return NextResponse.json({ error: 'Failed to enqueue validation job' }, { status: 500 });
  }

  return NextResponse.json(
    {
      job: {
        id: job.id,
        kind: job.kind,
        status: job.status,
        created_at: job.created_at,
      },
      profileVersionId: versionId,
      validationRunId: validationRun.id,
      validationSetId,
      caseCount: cases.length,
    },
    { status: 202 },
  );
}
