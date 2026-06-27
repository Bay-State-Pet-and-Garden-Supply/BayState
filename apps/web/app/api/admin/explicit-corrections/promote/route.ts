/**
 * POST /api/admin/explicit-corrections/promote
 *
 * Promote one or more explicit corrections into a draft Profile Version.
 *
 * Accepts an array of correction IDs, validates they share the same
 * brand/source/domain scope, aggregates their evidence into Field Evidence
 * Rules, creates a draft site_extraction_profile_version row
 * (created_from='explicit_correction'), and optionally enqueues a
 * validate_profile_version job.
 *
 * Returns 201 with the new version and optional job info.
 *
 * See docs/plans/site-extraction-profiles-implementation-plan.md §Phase 10
 * and docs/adr/0008-declarative-field-evidence-rules.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  createDraftVersionFromCorrections,
  buildStubCrawl4aiSchema,
} from '@/lib/profile-maintenance/explicit-correction-helpers';
import type { CorrectionRow } from '@/lib/profile-maintenance/explicit-correction-helpers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  // 1. Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const correctionIds = body.correction_ids as string[] | undefined;
  const autoValidate = body.auto_validate === true;

  if (!Array.isArray(correctionIds) || correctionIds.length === 0) {
    return NextResponse.json(
      { error: 'correction_ids is required and must be a non-empty array of UUIDs' },
      { status: 400 },
    );
  }

  const supabase = await createAdminClient();

  // 2. Load all corrections
  const { data: correctionsData, error: loadError } = await supabase
    .from('explicit_extraction_corrections')
    .select('*')
    .in('id', correctionIds)
    .order('created_at', { ascending: true }); // Stable order for deterministic hash

  if (loadError) {
    console.error('[PromoteCorrections] Failed to load corrections:', loadError.message);
    return NextResponse.json({ error: 'Failed to load corrections' }, { status: 500 });
  }

  if (!correctionsData || correctionsData.length === 0) {
    return NextResponse.json(
      { error: 'No corrections found for the provided IDs' },
      { status: 404 },
    );
  }

  if (correctionsData.length !== correctionIds.length) {
    const foundIds = new Set(correctionsData.map((c: Record<string, unknown>) => c.id));
    const missing = correctionIds.filter((id: string) => !foundIds.has(id));
    return NextResponse.json(
      { error: `Some corrections were not found: ${missing.join(', ')}` },
      { status: 404 },
    );
  }

  // 3. Validate all corrections share the same brand/source/domain scope
  const first = correctionsData[0] as Record<string, unknown>;
  const brandId = first.brand_id as string;
  const sourceSlug = first.source_slug as string;
  const canonicalDomain = first.canonical_domain as string;

  for (const c of correctionsData) {
    const row = c as Record<string, unknown>;
    if (
      row.brand_id !== brandId ||
      row.source_slug !== sourceSlug ||
      row.canonical_domain !== canonicalDomain
    ) {
      return NextResponse.json(
        {
          error:
            'All corrections must share the same brand_id, source_slug, and canonical_domain. ' +
            `Correction ${row.id} has brand_id=${row.brand_id}, source_slug=${row.source_slug}, ` +
            `canonical_domain=${row.canonical_domain}, but expected ` +
            `brand_id=${brandId}, source_slug=${sourceSlug}, canonical_domain=${canonicalDomain}.`,
        },
        { status: 400 },
      );
    }
  }

  // 4. Find or validate that a site_extraction_profile exists for this scope
  const { data: profile } = await supabase
    .from('site_extraction_profiles')
    .select('id, status')
    .eq('brand_id', brandId)
    .eq('source_slug', sourceSlug)
    .eq('canonical_domain', canonicalDomain)
    .maybeSingle();

  let profileId: string;

  if (profile) {
    profileId = profile.id;
  } else {
    // Auto-create a draft profile for this brand+source+domain
    const sourceType = 'explicit_correction';
    const { data: newProfile, error: createProfileError } = await supabase
      .from('site_extraction_profiles')
      .insert({
        brand_id: brandId,
        source_slug: sourceSlug,
        source_type: sourceType,
        canonical_domain: canonicalDomain,
        status: 'draft',
      })
      .select('id')
      .single();

    if (createProfileError || !newProfile) {
      console.error('[PromoteCorrections] Failed to create profile:', createProfileError?.message);
      return NextResponse.json({ error: 'Failed to create site extraction profile' }, { status: 500 });
    }

    profileId = newProfile.id;
  }

  // 5. Create draft version from corrections
  const typedCorrections = correctionsData as CorrectionRow[];
  const newVersion = await createDraftVersionFromCorrections(supabase, typedCorrections, {
    profileId,
    createdBy: auth.user.id,
    brandId,
    sourceSlug,
    canonicalDomain,
  });

  if (!newVersion) {
    return NextResponse.json(
      { error: 'Failed to create draft profile version from corrections' },
      { status: 500 },
    );
  }

  // 6. Build and attach a stub compiled_crawl4ai_schema for basic validation readiness
  //    The aggregated rules are already set in the version; the stub schema helps
  //    the validate route pass its compiled_crawl4ai_schema check.  The admin should
  //    refine via an AI schema draft job for production use.
  const { aggregateCorrectionsIntoRules } = await import(
    '@/lib/profile-maintenance/explicit-correction-helpers'
  );
  const aggregated = aggregateCorrectionsIntoRules(typedCorrections);
  const stubSchema = buildStubCrawl4aiSchema(aggregated);

  await supabase
    .from('site_extraction_profile_versions')
    .update({ compiled_crawl4ai_schema: stubSchema })
    .eq('id', (newVersion as Record<string, unknown>).id as string);

  // 7. Optionally enqueue a validate_profile_version job
  let validateJob: Record<string, unknown> | null = null;

  if (autoValidate) {
    // Find or create a validation set for the profile
    let validationSetId: string | null = null;

    const { data: existingSet } = await supabase
      .from('profile_validation_sets')
      .select('id')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSet) {
      validationSetId = existingSet.id;
    }

    if (validationSetId) {
      // Check for in-flight validation runs
      const { data: existingRun } = await supabase
        .from('profile_validation_runs')
        .select('id, status')
        .eq('profile_version_id', (newVersion as Record<string, unknown>).id as string)
        .in('status', ['pending', 'running'])
        .limit(1)
        .maybeSingle();

      if (!existingRun) {
        // Create a validation run
        const { data: validationRun } = await supabase
          .from('profile_validation_runs')
          .insert({
            profile_version_id: (newVersion as Record<string, unknown>).id as string,
            validation_set_id: validationSetId,
            status: 'pending',
          })
          .select('id')
          .single();

        if (validationRun) {
          // Enqueue validate job
          const jobPayload = {
            profile_version_id: (newVersion as Record<string, unknown>).id as string,
            profile_id: profileId,
            validation_set_id: validationSetId,
            validation_run_id: validationRun.id,
            compiled_crawl4ai_schema: stubSchema,
            rules: aggregated,
          };

          const { data: job } = await supabase
            .from('profile_maintenance_jobs')
            .insert({
              kind: 'validate_profile_version',
              status: 'queued',
              brand_id: brandId,
              source_slug: sourceSlug,
              canonical_domain: canonicalDomain,
              profile_id: profileId,
              profile_version_id: (newVersion as Record<string, unknown>).id as string,
              payload: jobPayload,
              required_capabilities: [
                'profile_maintenance',
                'profile_maintenance.validate_profile_version',
                'profile_maintenance.crawl4ai',
              ],
              max_attempts: 2,
              attempt_count: 0,
            })
            .select('id, kind, status, created_at')
            .single();

          if (job) {
            validateJob = job;
          }
        }
      }
    }
  }

  // 8. Return the result
  const response: Record<string, unknown> = {
    version: newVersion,
    profileId,
    correctionCount: typedCorrections.length,
  };

  if (validateJob) {
    response.validateJob = validateJob;
  }

  return NextResponse.json(response, { status: 201 });
}
