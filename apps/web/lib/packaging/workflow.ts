/**
 * Packaging Extraction Workflow
 *
 * Orchestrates packaging extraction jobs for the consolidation pipeline.
 * Creates queued extraction rows, polls for completion, and retrieves
 * the latest successful facts for a UPC.
 *
 * Design:
 * - Web creates queued rows (Vercel-safe, no long-running compute)
 * - Self-hosted runner claims and processes jobs via API
 * - Web polls for terminal status with bounded timeout
 * - Failure/timeout does not block consolidation — text-only fallback
 */

import { createAdminClient } from '@/lib/supabase/server';
import type { PackagingFacts } from './title-composer';
import { extractImageCandidatesFromSources } from '@/lib/product-sources';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const MAX_POLL_INTERVAL_MS = 10_000;
const DEFAULT_PACKAGING_PROMPT_VERSION = 'packaging-title-v1';
const DEFAULT_PACKAGING_SCHEMA_VERSION = 'packaging-extraction-v1';

// =============================================================================
// Types
// =============================================================================

export interface CreateExtractionJobsOptions {
  /** Trigger source — "consolidation" is the normal path */
  trigger?: 'consolidation' | 'image_selection' | 'manual_rerun';
  /** Workflow run ID to link extraction rows to */
  workflowRunId?: string;
  /** Override prompt version */
  promptVersion?: string;
  /** Override schema version */
  schemaVersion?: string;
  /** Max parallel attempts per UPC (default: 2) */
  maxAttempts?: number;
}

export interface ExtractionJobResult {
  extractionId: string;
  upc: string;
}

export interface CreateExtractionJobsResponse {
  extractionIds: string[];
  jobs: ExtractionJobResult[];
  skippedUpcs: string[];
}

export interface WaitForExtractionsResponse {
  status: 'completed' | 'partial' | 'timed_out';
  succeededIds: string[];
  failedIds: string[];
  timedOutIds: string[];
  total: number;
}

export interface LatestExtractionFacts {
  extractionId: string;
  upc: string;
  rawText: string | null;
  facts: PackagingFacts;
  fieldConfidence: Record<string, number>;
  overallConfidence: number | null;
  promptVersion: string;
  model: string | null;
  provider: string;
  completedAt: string | null;
}

// =============================================================================
// Helpers
// =============================================================================

function extractImageUrls(product: { imageUrls?: string[]; sources?: Record<string, unknown> }): string[] {
  // Prefer explicit imageUrls field, fall back to extracting from sources
  if (product.imageUrls && product.imageUrls.length > 0) {
    return product.imageUrls.slice(0, 2);
  }
  if (product.sources && Object.keys(product.sources).length > 0) {
    return extractImageCandidatesFromSources(product.sources, 2);
  }
  return [];
}

/**
 * Build a map of UPC → image URLs from an array of products.
 */
export function buildImageUrlsByUpc(
  products: Array<{ upc: string; imageUrls?: string[]; sources?: Record<string, unknown> }>,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const product of products) {
    const urls = extractImageUrls(product);
    if (urls.length > 0) {
      map[product.upc] = urls;
    }
  }
  return map;
}

// =============================================================================
// 1. Create Packaging Extraction Jobs
// =============================================================================

/**
 * Create queued packaging extraction jobs for products with usable images.
 *
 * Only creates rows for UPCs with at least one usable image URL.
 * Insert is lightweight and Vercel-safe.
 *
 * @param upcs - UPCs that need packaging extraction
 * @param imageUrlsByUpc - Map of UPC → array of image URLs
 * @param options - Optional settings
 * @returns The created extraction IDs and any skipped UPCs
 */
export async function createPackagingExtractionJobs(
  upcs: string[],
  imageUrlsByUpc: Record<string, string[]>,
  options: CreateExtractionJobsOptions = {},
): Promise<CreateExtractionJobsResponse> {
  const supabase = await createAdminClient();

  const trigger = options.trigger ?? 'consolidation';
  const promptVersion = options.promptVersion ?? DEFAULT_PACKAGING_PROMPT_VERSION;
  const schemaVersion = options.schemaVersion ?? DEFAULT_PACKAGING_SCHEMA_VERSION;
  const maxAttempts = options.maxAttempts ?? 2;

  const jobs: ExtractionJobResult[] = [];
  const skippedUpcs: string[] = [];

  for (const upc of upcs) {
    const imageUrls = imageUrlsByUpc[upc];
    if (!imageUrls || imageUrls.length === 0) {
      skippedUpcs.push(upc);
      continue;
    }

    // Limit to max 2 images per product
    const urls = imageUrls.slice(0, 2);

    const { data, error } = await supabase
      .from('product_packaging_extractions')
      .insert({
        upc,
        workflow_run_id: options.workflowRunId ?? null,
        status: 'queued',
        trigger,
        is_stale: false,
        attempt_count: 0,
        max_attempts: maxAttempts,
        provider: 'local_openai_compatible',
        model: null,
        prompt_version: promptVersion,
        schema_version: schemaVersion,
        image_urls: urls,
        image_fingerprints: [],
        image_metadata: [],
        raw_text: null,
        structured_facts: {},
        field_confidence: {},
        overall_confidence: null,
        conflicts: [],
        usage: {},
        debug_metadata: {},
      })
      .select('id, upc')
      .single();

    if (error) {
      console.error(`[PackagingWorkflow] Failed to create extraction for ${upc}:`, error.message);
      skippedUpcs.push(upc);
      continue;
    }

    jobs.push({
      extractionId: data.id,
      upc: data.upc,
    });
  }

  return {
    extractionIds: jobs.map((j) => j.extractionId),
    jobs,
    skippedUpcs,
  };
}

// =============================================================================
// 2. Wait for Packaging Extractions (with timeout)
// =============================================================================

/**
 * Poll extraction statuses until all are terminal or timeout expires.
 *
 * Terminal statuses: succeeded, failed, timed_out, skipped_no_images, stale.
 *
 * @param extractionIds - Array of extraction row IDs to wait for
 * @param timeoutSeconds - Max seconds to wait before giving up
 * @returns Aggregated status of all extractions
 */
export async function waitForPackagingExtractions(
  extractionIds: string[],
  timeoutSeconds: number = 600,
): Promise<WaitForExtractionsResponse> {
  if (extractionIds.length === 0) {
    return {
      status: 'completed',
      succeededIds: [],
      failedIds: [],
      timedOutIds: [],
      total: 0,
    };
  }

  const supabase = await createAdminClient();
  const startTime = Date.now();
  const deadlineMs = startTime + timeoutSeconds * 1000;

  const succeededIds: string[] = [];
  const failedIds: string[] = [];
  const timedOutIds: string[] = [];

  let pollInterval = DEFAULT_POLL_INTERVAL_MS;

  while (Date.now() < deadlineMs) {
    const { data: rows, error } = await supabase
      .from('product_packaging_extractions')
      .select('id, status')
      .in('id', extractionIds);

    if (error) {
      console.error('[PackagingWorkflow] Failed to poll extractions:', error.message);
      // Continue polling — transient error
      await sleep(pollInterval);
      pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL_MS);
      continue;
    }

    if (!rows || rows.length === 0) {
      // All extraction rows disappeared — treat as failed
      timedOutIds.push(...extractionIds);
      break;
    }

    const pendingIds: string[] = [];
    const terminalStatuses = new Set(['succeeded', 'failed', 'timed_out', 'skipped_no_images', 'stale']);

    for (const row of rows) {
      if (row.status === 'succeeded') {
        succeededIds.push(row.id);
      } else if (terminalStatuses.has(row.status)) {
        failedIds.push(row.id);
      } else {
        pendingIds.push(row.id);
      }
    }

    if (pendingIds.length === 0) {
      // All terminal
      return {
        status: succeededIds.length > 0 ? 'completed' : 'partial',
        succeededIds,
        failedIds,
        timedOutIds,
        total: extractionIds.length,
      };
    }

    // Some still pending — wait before retry
    await sleep(pollInterval);
    pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL_MS);
  }

  // Timeout expired — mark remaining pending as timed out
  timedOutIds.push(
    ...extractionIds.filter(
      (id) => !succeededIds.includes(id) && !failedIds.includes(id),
    ),
  );

  const hasSucceeded = succeededIds.length > 0;
  const hasTimedOut = timedOutIds.length > 0;

  return {
    status: hasSucceeded && !hasTimedOut ? 'completed' : hasSucceeded ? 'partial' : 'timed_out',
    succeededIds,
    failedIds,
    timedOutIds,
    total: extractionIds.length,
  };
}

/**
 * Sleep helper for polling.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// 3. Get Latest Successful Extraction Facts for a UPC
// =============================================================================

/**
 * Get the latest successful, non-stale packaging extraction for a UPC.
 *
 * Returns null when no suitable extraction exists.
 *
 * @param upc - The product UPC
 * @returns Structured extraction facts, or null if none available
 */
export async function getLatestExtractionFacts(upc: string): Promise<LatestExtractionFacts | null> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('product_packaging_extractions')
    .select(
      'id, upc, raw_text, structured_facts, field_confidence, overall_confidence, prompt_version, model, provider, completed_at',
    )
    .eq('upc', upc)
    .eq('status', 'succeeded')
    .eq('is_stale', false)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[PackagingWorkflow] Failed to fetch extraction for ${upc}:`, error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  const structuredFacts = (data.structured_facts ?? {}) as Record<string, unknown>;
  const fieldConfidence = (data.field_confidence ?? {}) as Record<string, number>;
  const numericConfidence =
    typeof data.overall_confidence === 'number' ? data.overall_confidence : null;

  return {
    extractionId: data.id,
    upc: data.upc,
    rawText: data.raw_text,
    facts: {
      packaging_title: asOptionalString(structuredFacts.packaging_title),
      brand: asOptionalString(structuredFacts.brand),
      product_line: asOptionalString(structuredFacts.product_line),
      variant: asOptionalString(structuredFacts.variant),
      flavor: asOptionalString(structuredFacts.flavor),
      color: asOptionalString(structuredFacts.color),
      scent: asOptionalString(structuredFacts.scent),
      material: asOptionalString(structuredFacts.material),
      product_type: asOptionalString(structuredFacts.product_type),
      size: asOptionalString(structuredFacts.size),
      weight: asOptionalString(structuredFacts.weight),
      count: asOptionalString(structuredFacts.count),
      packaging_type: asOptionalString(structuredFacts.packaging_type),
      claims: Array.isArray(structuredFacts.claims) ? structuredFacts.claims.map(String) : [],
    },
    fieldConfidence,
    overallConfidence: numericConfidence,
    promptVersion: data.prompt_version,
    model: data.model,
    provider: data.provider,
    completedAt: data.completed_at,
  };
}

function asOptionalString(value: unknown): string | null | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

// =============================================================================
// 4. Create Pipeline Workflow Run
// =============================================================================

/**
 * Create a pipeline workflow run for tracking consolidation-with-packaging.
 */
export async function createWorkflowRun(options: {
  upcs: string[];
  packagingTitleMode: 'disabled' | 'shadow' | 'suggestion' | 'auto_draft_high_confidence';
  fallbackPolicy: 'none' | 'external_api';
  packagingTimeoutSeconds: number;
  batchJobId?: string;
}): Promise<string | null> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('pipeline_workflow_runs')
    .insert({
      kind: 'consolidation_with_packaging',
      status: 'queued',
      upcs: options.upcs,
      groups: [],
      packaging_title_mode: options.packagingTitleMode,
      fallback_policy: options.fallbackPolicy,
      packaging_timeout_seconds: options.packagingTimeoutSeconds,
      batch_job_id: options.batchJobId ?? null,
      metadata: {},
    })
    .select('id')
    .single();

  if (error) {
    console.error('[PackagingWorkflow] Failed to create workflow run:', error.message);
    return null;
  }

  return data.id;
}

/**
 * Update a pipeline workflow run status and link extraction IDs.
 */
export async function updateWorkflowRun(
  workflowRunId: string,
  updates: {
    status?: string;
    batchJobId?: string;
    extractionIds?: string[];
    errorMessage?: string;
  },
): Promise<void> {
  const supabase = await createAdminClient();

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status) payload.status = updates.status;
  if (updates.batchJobId) payload.batch_job_id = updates.batchJobId;
  if (updates.extractionIds) payload.metadata = { extraction_ids: updates.extractionIds };
  if (updates.errorMessage) payload.error_message = updates.errorMessage;

  const { error } = await supabase
    .from('pipeline_workflow_runs')
    .update(payload)
    .eq('id', workflowRunId);

  if (error) {
    console.error(`[PackagingWorkflow] Failed to update workflow run ${workflowRunId}:`, error.message);
  }
}

// =============================================================================
// 5. Create Product Title Suggestion
// =============================================================================

/**
 * Store a packaging title suggestion linked to an extraction.
 */
export async function storeTitleSuggestion(options: {
  upc: string;
  workflowRunId?: string | null;
  extractionId: string;
  title: string;
  confidenceScore: number;
  fieldConfidence: Record<string, number>;
  composerVersion: string;
  mode: string;
  reasons: string[];
  conflicts: string[];
  status?: 'created' | 'shown' | 'applied' | 'rejected';
}): Promise<string | null> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('product_title_suggestions')
    .insert({
      upc: options.upc,
      workflow_run_id: options.workflowRunId ?? null,
      packaging_extraction_id: options.extractionId,
      suggestion_type: 'packaging_vision',
      title: options.title,
      confidence_score: options.confidenceScore,
      field_confidence: options.fieldConfidence,
      composer_version: options.composerVersion,
      mode: options.mode,
      reasons: options.reasons,
      conflicts: options.conflicts,
      status: options.status ?? 'created',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[PackagingWorkflow] Failed to store title suggestion:', error.message);
    return null;
  }

  return data.id;
}

/**
 * Update a title suggestion's status (e.g., mark as applied).
 */
export async function updateTitleSuggestion(
  suggestionId: string,
  status: 'created' | 'shown' | 'applied' | 'rejected' | 'stale',
): Promise<void> {
  const supabase = await createAdminClient();

  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'applied') {
    payload.applied_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('product_title_suggestions')
    .update(payload)
    .eq('id', suggestionId);

  if (error) {
    console.error(`[PackagingWorkflow] Failed to update suggestion ${suggestionId}:`, error.message);
  }
}
