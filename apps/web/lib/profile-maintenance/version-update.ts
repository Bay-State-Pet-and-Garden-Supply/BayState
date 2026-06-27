/**
 * Profile Version update helpers for profile-maintenance result processing.
 *
 * Provides functions that the result endpoint calls to create/update
 * site_extraction_profile_versions and profile_validation_runs rows after
 * draft_site_extraction_profile and validate_profile_version jobs complete.
 *
 * These updates are intentionally non-fatal: if a row update fails, the
 * caller is expected to log a warning and still return success for the job.
 *
 * See handoff/ai-schema-draft-validation-next-slice-plan.md §3.6
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Expected shape of the artifact payload for a draft_site_extraction_profile
 * succeeded job.
 */
interface DraftProfileArtifactPayload {
  field_evidence_rules: Record<string, unknown>;
  compiled_crawl4ai_schema: Record<string, unknown>;
  version_hash: string;
  seed_url_used?: string;
  schema_generation_summary?: Record<string, unknown>;
}

/**
 * Expected shape of the job payload for a draft_site_extraction_profile job.
 */
interface DraftProfileJobPayload {
  profile_id: string;
  brand_id: string;
  source_slug: string;
  canonical_domain: string;
  verified_seed_ids?: string[];
  verified_seed_urls?: string[];
}

/**
 * Expected shape of the job payload for a validate_profile_version job.
 */
interface ValidateVersionJobPayload {
  profile_version_id: string;
  profile_id: string;
  validation_set_id: string;
  validation_run_id: string;
}

// =============================================================================
// updateVersionFromDraft
// =============================================================================

/**
 * Called when a draft_site_extraction_profile job succeeds.
 *
 * Creates a new site_extraction_profile_version row in draft status with
 * the generated Field Evidence Rules, compiled Crawl4AI schema, and
 * deterministic version hash.
 *
 * Determines the next version_number by looking at the latest existing
 * version for the profile.
 *
 * @param supabase  Admin Supabase client
 * @param jobId     Profile-maintenance job ID (for logging)
 * @param jobPayload  The job's payload (must contain profile_id)
 * @param resultPayload  The job's result payload (must contain artifact_payload with rules + schema)
 * @param artifactId  Durable artifact ID to link, or null if artifact creation failed
 */
export async function updateVersionFromDraft(
  supabase: SupabaseClient,
  jobId: string,
  jobPayload: Record<string, unknown>,
  resultPayload: Record<string, unknown>,
  artifactId: string | null,
): Promise<void> {
  // Require a durable artifact before modifying target rows
  if (!artifactId) {
    console.warn(
      `[VersionUpdate] Skipping draft version creation for job ${jobId}: no durable artifact`,
    );
    return;
  }

  const payload = jobPayload as Partial<DraftProfileJobPayload>;
  const profileId = payload.profile_id;
  if (!profileId) {
    return;
  }

  // The artifact payload lives inside resultPayload.artifact_payload
  // when the runner nests it, or directly in resultPayload.
  const artifactPayload = (resultPayload?.artifact_payload ?? resultPayload) as Partial<DraftProfileArtifactPayload>;
  const fieldEvidenceRules = artifactPayload.field_evidence_rules;
  const compiledCrawl4aiSchema = artifactPayload.compiled_crawl4ai_schema;
  const versionHash = artifactPayload.version_hash;

  if (!fieldEvidenceRules || !compiledCrawl4aiSchema || !versionHash) {
    console.warn(
      `[VersionUpdate] Missing required artifact data for draft version creation on job ${jobId}`,
    );
    return;
  }

  // Determine next version_number
  const { data: latestVersion } = await supabase
    .from('site_extraction_profile_versions')
    .select('version_number')
    .eq('profile_id', profileId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latestVersion?.version_number ?? 0) + 1;

  const { error } = await supabase
    .from('site_extraction_profile_versions')
    .insert({
      profile_id: profileId,
      version_number: versionNumber,
      status: 'draft',
      rules: fieldEvidenceRules,
      compiled_crawl4ai_schema: compiledCrawl4aiSchema,
      version_hash: versionHash,
      created_from: 'ai_schema_draft',
    });

  if (error) {
    console.warn(
      `[VersionUpdate] Failed to create draft version for profile ${profileId} from job ${jobId}:`,
      error.message,
    );
  }
}

// =============================================================================
// updateValidationRunFromValidation
// =============================================================================

/**
 * Called when a validate_profile_version job succeeds.
 *
 * Updates the profile_validation_runs row with the validation result
 * (passed/failed/error) and links the summary artifact.
 *
 * Also updates the profile version status:
 * - On pass: version stays in 'validating' (awaiting approval)
 * - On fail: version goes back to 'draft' (needs correction)
 * - On error: no version status change
 *
 * @param supabase  Admin Supabase client
 * @param jobId     Profile-maintenance job ID (for logging)
 * @param jobPayload  The job's payload (must contain validation_run_id)
 * @param resultPayload  The job's result payload (must contain validation_status + summary)
 * @param artifactId  Durable artifact ID to link, or null
 */
export async function updateValidationRunFromValidation(
  supabase: SupabaseClient,
  jobId: string,
  jobPayload: Record<string, unknown>,
  resultPayload: Record<string, unknown>,
  artifactId: string | null,
): Promise<void> {
  // Require a durable artifact before modifying target rows
  if (!artifactId) {
    console.warn(
      `[VersionUpdate] Skipping validation run update for job ${jobId}: no durable artifact`,
    );
    return;
  }

  const payload = jobPayload as Partial<ValidateVersionJobPayload>;
  const validationRunId = payload.validation_run_id;
  const profileVersionId = payload.profile_version_id;

  if (!validationRunId) return;

  const validationStatus = resultPayload?.validation_status as string | undefined;
  if (!validationStatus || !['passed', 'failed', 'error'].includes(validationStatus)) {
    return;
  }

  const summary = (resultPayload?.summary as Record<string, unknown>) ?? {};

  // Map validation_status → run status
  let runStatus: string;
  if (validationStatus === 'passed') runStatus = 'passed';
  else if (validationStatus === 'failed') runStatus = 'failed';
  else runStatus = 'error';

  // Update validation run record
  await supabase
    .from('profile_validation_runs')
    .update({
      status: runStatus,
      summary_artifact_id: artifactId,
      result: summary,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', validationRunId);

  // Update version status based on validation result
  if (profileVersionId) {
    if (validationStatus === 'passed') {
      await supabase
        .from('site_extraction_profile_versions')
        .update({
          status: 'validating',
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileVersionId)
        .eq('status', 'draft'); // Only update if still draft
    } else if (validationStatus === 'failed') {
      await supabase
        .from('site_extraction_profile_versions')
        .update({
          status: 'draft', // Stay in draft for correction
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileVersionId)
        .eq('status', 'validating');
    }
  }
}
