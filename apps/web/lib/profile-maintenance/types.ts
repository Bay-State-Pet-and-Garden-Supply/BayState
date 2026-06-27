/**
 * Profile Maintenance shared types.
 * Mirrored from the plan §1.4 and §2.2.
 */

// =============================================================================
// Job Kinds (matches DB CHECK constraint)
// =============================================================================
export const PROFILE_MAINTENANCE_JOB_KINDS = [
  'verify_pdp_seed',
  'draft_site_extraction_profile',
  'validate_profile_version',
  'browser_profile_setup',
  'browser_profile_revalidate',
] as const;
export type ProfileMaintenanceJobKind = (typeof PROFILE_MAINTENANCE_JOB_KINDS)[number];

// =============================================================================
// Job Statuses
// =============================================================================
export const PROFILE_MAINTENANCE_JOB_STATUSES = [
  'queued',
  'claimed',
  'running',
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
] as const;
export type ProfileMaintenanceJobStatus = (typeof PROFILE_MAINTENANCE_JOB_STATUSES)[number];

// =============================================================================
// Artifact Statuses
// =============================================================================
export const PROFILE_MAINTENANCE_ARTIFACT_STATUSES = [
  'created',
  'reviewed',
  'rejected',
] as const;
export type ProfileMaintenanceArtifactStatus = (typeof PROFILE_MAINTENANCE_ARTIFACT_STATUSES)[number];

export const PROFILE_MAINTENANCE_ARTIFACT_REVIEW_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'needs_attention',
] as const;
export type ProfileMaintenanceArtifactReviewStatus = (typeof PROFILE_MAINTENANCE_ARTIFACT_REVIEW_STATUSES)[number];

// =============================================================================
// Terminal statuses for job result submission
// =============================================================================
export const PROFILE_MAINTENANCE_TERMINAL_STATUSES = [
  'succeeded',
  'failed',
  'timed_out',
] as const;
export type ProfileMaintenanceTerminalStatus = (typeof PROFILE_MAINTENANCE_TERMINAL_STATUSES)[number];

// =============================================================================
// Capability keys
// =============================================================================
export interface ProfileMaintenanceCapabilities {
  enabled: boolean;
  verify_pdp_seed?: boolean;
  crawl4ai?: boolean;
  model_schema_draft?: boolean;
  draft_site_extraction_profile?: boolean;
  validate_profile_version?: boolean;
  browser_profile_setup?: boolean;
  browser_profile_runtime?: boolean;
}

// =============================================================================
// Claim endpoint request/response
// =============================================================================
export interface ClaimProfileMaintenanceJobRequest {
  runner_name?: string;
  max_attempts?: number;
  capabilities?: {
    profile_maintenance?: ProfileMaintenanceCapabilities;
  };
  /** Optional filter: only claim jobs of these kinds */
  job_kinds?: ProfileMaintenanceJobKind[];
}

export interface ClaimedProfileMaintenanceJob {
  job_id: string;
  kind: ProfileMaintenanceJobKind;
  brand_id?: string;
  source_slug?: string;
  canonical_domain?: string;
  profile_id?: string;
  profile_version_id?: string;
  browser_profile_id?: string;
  payload: Record<string, unknown>;
  lease_token: string;
  lease_expires_at: string;
  attempt_count: number;
  max_attempts: number;
}

export interface ClaimProfileMaintenanceJobResponse {
  job: ClaimedProfileMaintenanceJob | null;
  reason?: string;
}

// =============================================================================
// Progress endpoint
// =============================================================================
export interface SubmitProfileMaintenanceProgressRequest {
  job_id: string;
  lease_token: string;
  status: 'running' | 'failed';
  progress?: number;
  phase?: string;
  message?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Result endpoint
// =============================================================================
export interface SubmitProfileMaintenanceResultRequest {
  status: ProfileMaintenanceTerminalStatus;
  lease_token: string;
  result?: Record<string, unknown>;
  error_code?: string;
  error_message?: string;
  /** Optional: create an artifact alongside the job result */
  artifact?: {
    kind: ProfileMaintenanceJobKind;
    schema_version: string;
    payload: Record<string, unknown>;
    evidence_refs?: Record<string, unknown>;
    content_hash?: string;
    content_size_bytes?: number;
    content_type?: string;
    runner_environment?: string;
    runner_build_id?: string;
  };
}

// =============================================================================
// Artifact response type for GET endpoints
// =============================================================================
export interface ProfileMaintenanceArtifact {
  id: string;
  artifact_version: string;
  kind: ProfileMaintenanceJobKind;
  job_id: string;
  attempt_number: number;
  brand_id?: string;
  source_slug?: string;
  canonical_domain?: string;
  profile_id?: string;
  profile_version_id?: string;
  browser_profile_id?: string;
  runner_name?: string;
  runner_environment?: string;
  runner_build_id?: string;
  status: ProfileMaintenanceArtifactStatus;
  schema_version: string;
  payload: Record<string, unknown>;
  evidence_refs: Record<string, unknown>;
  content_hash?: string;
  content_size_bytes?: number;
  content_type?: string;
  review_status: ProfileMaintenanceArtifactReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_comment?: string;
  created_at: string;
}

// =============================================================================
// PDP Seed types
// =============================================================================

/**
 * Trust status values for product_detail_page_seeds.
 * Matches the DB CHECK constraint.
 */
export const PDP_SEED_TRUST_STATUSES = ['candidate', 'verified', 'rejected', 'expired'] as const;
export type PdpSeedTrustStatus = (typeof PDP_SEED_TRUST_STATUSES)[number];

/**
 * Verification status values that the runner can return
 * inside the result payload for verify_pdp_seed jobs.
 */
export const VERIFICATION_STATUSES = ['verified', 'rejected', 'expired'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * Typed result payload for a verify_pdp_seed job.
 */
export interface VerifyPdpSeedResult {
  verification_status: VerificationStatus;
  page_classification?: string;
  canonical_domain?: string;
  url?: string;
  rejection_reason?: string;
  image_candidates?: Array<{
    url: string;
    source_type: string;
    width?: number;
    height?: number;
  }>;
}
