/**
 * PDP Seed update helpers for profile-maintenance result processing.
 *
 * Provides a single function, `updateSeedFromVerification`, that the result
 * endpoint calls to update `product_detail_page_seeds` rows after a
 * `verify_pdp_seed` job completes.
 *
 * This update is intentionally non-fatal: if the seed row update fails, the
 * caller is expected to log a warning and still return success for the job.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * VerifyPdpSeedJobPayload mirrors what the admin enqueue route stores in
 * profile_maintenance_jobs.payload so the result callback can find the
 * target PDP seed.
 */
interface VerifyPdpSeedJobPayload {
  pdp_seed_id: string;
  url: string;
  normalized_url: string;
  brand_id: string;
  source_slug: string;
  canonical_domain: string;
}

/**
 * Update a product_detail_page_seeds row after a verify_pdp_seed job
 * completes successfully.
 *
 * Rules (per guardrails & plan):
 * - verified + page_classification === 'product_detail_page' → trust_status='verified', set verified_at, set verification_artifact_id
 * - verified without PDP page-classification evidence → seed stays candidate (no-op)
 * - rejected  → trust_status='rejected', set verification_artifact_id, do NOT set verified_at/verified_by
 * - expired   → trust_status='expired', set verification_artifact_id if present
 * - unknown verification_status → no-op
 * - missing pdp_seed_id in payload → no-op
 *
 * The update is non-fatal. Errors are logged via console.warn.
 *
 * @param supabase  Admin Supabase client
 * @param jobId     Profile-maintenance job ID (for logging)
 * @param jobPayload  The job's payload (must contain pdp_seed_id)
 * @param resultPayload  The job's result payload (must contain verification_status)
 * @param artifactId  Durable artifact ID to link, or null if artifact creation failed
 */
export async function updateSeedFromVerification(
  supabase: SupabaseClient,
  jobId: string,
  jobPayload: Record<string, unknown>,
  resultPayload: Record<string, unknown>,
  artifactId: string | null,
): Promise<void> {
  const payload = jobPayload as Partial<VerifyPdpSeedJobPayload>;
  const pdpSeedId = payload.pdp_seed_id;
  if (!pdpSeedId) {
    // Some verify_pdp_seed jobs may not have a pdp_seed_id (test payloads)
    return;
  }

  const verificationStatus = resultPayload?.verification_status as string | undefined;
  if (!verificationStatus || !['verified', 'rejected', 'expired'].includes(verificationStatus)) {
    return;
  }

  if (!artifactId) {
    console.warn(
      `[SeedUpdate] Skipping PDP seed ${pdpSeedId} update for job ${jobId}: missing durable artifact id`,
    );
    return;
  }

  // Validate seed scope matches job scope if payload includes scope fields
  // (the job's brand_id/source_slug/canonical_domain should match the seed's)
  // We do a targeted update using pdp_seed_id only; the scope guard is enforced
  // below by checking the row before updating (best-effort).

  const pageClassification = resultPayload?.page_classification as string | undefined;

  if (verificationStatus === 'verified') {
    // Require PDP page-classification evidence before marking trusted.
    // Without this evidence, seeds stay candidate even if verification_status
    // says verified (avoid false trust from non-PDP pages).
    if (pageClassification !== 'product_detail_page') {
      return;
    }
  }

  const updateData: Record<string, unknown> = {
    trust_status: verificationStatus === 'expired' ? 'expired' : verificationStatus,
  };

  if (verificationStatus === 'verified') {
    updateData.verified_at = new Date().toISOString();
    // verified_by intentionally left null — runner name is not a user UUID.
    // A human-admin verification path can add it later.
  }

  updateData.verification_artifact_id = artifactId;

  // Scope guard: if the payload includes brand_id/source_slug/canonical_domain,
  // verify the seed row matches before applying the update.
  let query = supabase
    .from('product_detail_page_seeds')
    .update(updateData)
    .eq('id', pdpSeedId);

  if (payload.brand_id) {
    query = query.eq('brand_id', payload.brand_id);
  }
  if (payload.source_slug) {
    query = query.eq('source_slug', payload.source_slug);
  }
  if (payload.canonical_domain) {
    query = query.eq('canonical_domain', payload.canonical_domain);
  }

  const { error } = await query;

  if (error) {
    console.warn(
      `[SeedUpdate] Failed to update PDP seed ${pdpSeedId} for job ${jobId}:`,
      error.message,
    );
  }

  // After successful seed update to verified, auto-create a validation case
  if (verificationStatus === 'verified' && pageClassification === 'product_detail_page') {
    await ensureValidationCaseForSeed(supabase, pdpSeedId, payload);
  }
}

/**
 * Auto-create a seed validation case when a PDP seed becomes verified.
 *
 * Finds or creates the default validation set for the profile, then creates
 * a profile_validation_cases row linked to the seed.
 *
 * Skipped if the seed already has a validation_case_id set.
 */
async function ensureValidationCaseForSeed(
  supabase: SupabaseClient,
  pdpSeedId: string,
  jobPayload: Partial<VerifyPdpSeedJobPayload>,
): Promise<void> {
  const { brand_id, source_slug, canonical_domain } = jobPayload;
  if (!brand_id || !source_slug || !canonical_domain) return;

  // 1. Find the profile for this scope
  const { data: profile } = await supabase
    .from('site_extraction_profiles')
    .select('id')
    .eq('brand_id', brand_id)
    .eq('source_slug', source_slug)
    .eq('canonical_domain', canonical_domain)
    .maybeSingle();

  if (!profile) return;

  // 2. Check the seed already has a validation_case_id
  const { data: seed } = await supabase
    .from('product_detail_page_seeds')
    .select('id, url, validation_case_id')
    .eq('id', pdpSeedId)
    .single();

  if (!seed || seed.validation_case_id) return; // Already has a case

  // 3. Find or create the default validation set for this profile
  let validationSetId: string;
  const { data: existingSet } = await supabase
    .from('profile_validation_sets')
    .select('id')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSet) {
    validationSetId = existingSet.id;
  } else {
    const { data: newSet } = await supabase
      .from('profile_validation_sets')
      .insert({
        profile_id: profile.id,
        name: 'Auto-generated seed validation set',
        description: 'Validation cases created automatically from verified PDP seeds.',
      })
      .select('id')
      .single();
    if (!newSet) return;
    validationSetId = newSet.id;
  }

  // 4. Create a seed validation case
  const { data: validationCase } = await supabase
    .from('profile_validation_cases')
    .insert({
      validation_set_id: validationSetId,
      case_type: 'seed',
      pdp_seed_id: pdpSeedId,
      target_url: seed.url,
      expected_assertions: {
        page_type: 'product_detail_page',
      },
    })
    .select('id')
    .single();

  if (validationCase) {
    // 5. Link back from seed
    await supabase
      .from('product_detail_page_seeds')
      .update({ validation_case_id: validationCase.id })
      .eq('id', pdpSeedId);
  }
}

/**
 * Look up the most recently created artifact for a given job + attempt.
 *
 * This is used as a fallback when the artifact insert in the result endpoint
 * did not return the created ID. Prefer capturing the artifact ID directly
 * from `.select('id')` on insert.
 */
export async function lookupCreatedArtifactId(
  supabase: SupabaseClient,
  jobId: string,
  attemptNumber: number,
): Promise<string | null> {
  const { data } = await supabase
    .from('profile_maintenance_artifacts')
    .select('id')
    .eq('job_id', jobId)
    .eq('attempt_number', attemptNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}
