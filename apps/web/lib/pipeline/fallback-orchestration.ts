/**
 * Fallback Orchestration Module
 *
 * Coordinator-owned functions for SERPER/AI fallback extraction.
 *
 * Static scraping always runs first. Products that fail the static
 * scrape quality gate enter `needs_fallback_review`. An admin approves
 * the fallback here, which triggers SERPER URL discovery and/or
 * direct URL extraction through the existing extraction pipeline.
 *
 * Only this module creates fallback jobs. The Python runner stays
 * stateless — it only executes assigned extraction jobs.
 */

import { createClient, SupabaseClient } from '@/lib/supabase/server';
import type { PersistedPipelineStatus } from '@/lib/pipeline/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FallbackApprovalOptions {
    /** Admin user who approved the fallback */
    approvedBy: string;
    /** Optional budget scope — used for cost gating across bulk operations */
    budgetScope?: string;
    /** Human-readable reason from the quality evaluation that triggered fallback */
    qualityReason: string;
    /** IDs of the parent static scrape jobs that produced insufficient results */
    sourceJobIds: string[];
    /** IDs of scrape quality verdict rows (from scrape_quality JSONB) */
    qualityVerdictKeys?: string[];
}

export interface FallbackApprovalResult {
    success: boolean;
    discoveryJobId?: string;
    approvedSkuCount: number;
    error?: string;
}

export interface FallbackExtractionOptions {
    /** The selected URLs by SKU for direct extraction */
    urlsBySku: Record<string, string>;
    /** URL source: 'serper' | 'manual' */
    urlSourceBySku: Record<string, 'serper' | 'manual'>;
    /** Cohort context for brand/domain info */
    cohort: {
        id: string;
        brandId: string;
        brandName: string;
        officialDomains?: string[];
        preferredDomains?: string[];
    };
    /** Admin user who approved the extraction */
    approvedBy: string;
    /** ID of the parent discovery job (if any) */
    discoveryJobId?: string;
}

interface FallbackSkuContext {
    sku: string;
    cohortId?: string | null;
    input?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

async function loadFallbackSkuContexts(
    supabase: SupabaseClient,
    skus: string[],
): Promise<Map<string, FallbackSkuContext>> {
    if (skus.length === 0) return new Map();

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('sku, cohort_id, input')
        .in('sku', skus);

    if (error) {
        console.error('[Fallback Orchestration] Failed to load SKU contexts:', error);
        throw new Error(`Failed to load fallback SKU contexts: ${error.message}`);
    }

    const bySku = new Map<string, FallbackSkuContext>();
    for (const row of data || []) {
        bySku.set(row.sku, {
            sku: row.sku,
            cohortId: row.cohort_id
                ? toOptionalString(row.cohort_id)
                : undefined,
            input: (row.input as Record<string, unknown> | null) || null,
        });
    }
    return bySku;
}

async function transitionSkus(
    supabase: SupabaseClient,
    skus: string[],
    status: PersistedPipelineStatus,
): Promise<void> {
    if (skus.length === 0) return;

    const { error } = await supabase
        .from('products_ingestion')
        .update({
            pipeline_status: status,
            updated_at: new Date().toISOString(),
        })
        .in('sku', skus);

    if (error) {
        console.error(`[Fallback Orchestration] Failed to transition SKUs to ${status}:`, error);
        throw new Error(`Failed to transition SKUs to ${status}: ${error.message}`);
    }
}

async function recordFallbackMetadata(
    supabase: SupabaseClient,
    skus: string[],
    metadata: Record<string, unknown>,
): Promise<void> {
    if (skus.length === 0) return;

    // Read existing metadata and merge
    const { data: existing } = await supabase
        .from('products_ingestion')
        .select('sku, fallback_metadata')
        .in('sku', skus);

    const updates = (existing || []).map((row) => {
        const prior = (row.fallback_metadata as Record<string, unknown>) || {};
        return {
            sku: row.sku,
            fallback_metadata: {
                ...prior,
                ...metadata,
                updated_at: new Date().toISOString(),
            },
        };
    });

    // Batch update via upsert
    const { error } = await supabase
        .from('products_ingestion')
        .upsert(updates, { onConflict: 'sku' });

    if (error) {
        console.error('[Fallback Orchestration] Failed to record fallback metadata:', error);
        throw new Error(`Failed to record fallback metadata: ${error.message}`);
    }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Approve fallback extraction for a set of SKUs that failed the static
 * scrape quality gate.
 *
 * Flow:
 * 1. Validate that SKUs are in `needs_fallback_review` (or forced override)
 * 2. Record approval metadata on products_ingestion.fallback_metadata
 * 3. Transition SKUs to `searching`
 * 4. Run SERPER URL discovery via the existing server-side discovery path
 * 5. After discovery, admin uses existing URL review workspace to select
 *    extraction targets; extraction is queued separately
 */
export async function approveFallbackForSkus(
    supabase: SupabaseClient | undefined,
    skus: string[],
    options: FallbackApprovalOptions,
): Promise<FallbackApprovalResult> {
    const client = supabase ?? (await createClient());
    const normalizedSkus = [...new Set(skus.filter((s) => toOptionalString(s)))];

    if (normalizedSkus.length === 0) {
        return { success: false, approvedSkuCount: 0, error: 'No valid SKUs provided' };
    }

    const nowIso = new Date().toISOString();

    // Validate SKUs are in needs_fallback_review
    const { data: currentRows } = await client
        .from('products_ingestion')
        .select('sku, pipeline_status')
        .in('sku', normalizedSkus);

    const invalidSkus = (currentRows || [])
        .filter((row) => row.pipeline_status !== 'needs_fallback_review')
        .map((row) => row.sku);

    if (invalidSkus.length > 0) {
        return {
            success: false,
            approvedSkuCount: 0,
            error: `SKUs not in needs_fallback_review status: ${invalidSkus.join(', ')}`,
        };
    }

    // Record approval metadata
    const approvalMetadata: Record<string, unknown> = {
        pipeline_version: 'static_first_v1',
        orchestration_kind: 'fallback_serper_discovery',
        approved_by: options.approvedBy,
        approved_at: nowIso,
        budget_scope: options.budgetScope ?? 'default',
        quality_reason: options.qualityReason,
        source_job_ids: options.sourceJobIds,
    };

    if (options.qualityVerdictKeys && options.qualityVerdictKeys.length > 0) {
        approvalMetadata.quality_verdict_keys = options.qualityVerdictKeys;
    }

    await recordFallbackMetadata(client, normalizedSkus, approvalMetadata);

    // Transition to searching for URL discovery
    await transitionSkus(client, normalizedSkus, 'searching' as any);

    // Discover cohort ID (take the first non-null)
    const skuContexts = await loadFallbackSkuContexts(client, normalizedSkus);
    const cohortId = Array.from(skuContexts.values())
        .map((c) => c.cohortId)
        .find(Boolean);

    if (!cohortId) {
        console.warn(
            '[Fallback Orchestration] No cohort ID found for SKUs — cannot run SERPER discovery'
        );
        // Transition back to needs_fallback_review so admin can assign cohort
        await transitionSkus(client, normalizedSkus, 'needs_fallback_review' as any);
        return {
            success: false,
            approvedSkuCount: 0,
            error: 'SKUs are not assigned to a cohort. Cannot run SERPER URL discovery without cohort context.',
        };
    }

    // Run SERPER URL discovery server-side
    const { runOfficialBrandDiscovery } = await import(
        '@/lib/official-brand-discovery'
    );

    const discoveryResult = await runOfficialBrandDiscovery({
        cohortId,
        skus: normalizedSkus,
    });

    if (!discoveryResult.success) {
        console.error('[Fallback Orchestration] URL discovery failed:', discoveryResult.error);
        return {
            success: false,
            approvedSkuCount: 0,
            error: `Fallback URL discovery failed: ${discoveryResult.error}`,
        };
    }

    return {
        success: true,
        approvedSkuCount: normalizedSkus.length,
    };
}

/**
 * Queue a fallback URL extraction job for SKUs that have approved
 * URL candidates selected in the URL review workspace.
 *
 * Creates a `direct_url_extraction` scrape job with the selected URLs
 * and cohort context. The runner executes ProductPageExtractor for each URL.
 *
 * @returns The ID of the created scrape job, or throws on failure.
 */
export async function queueFallbackExtractionJob(
    supabase: SupabaseClient,
    skus: string[],
    options: FallbackExtractionOptions,
): Promise<string> {
    const normalizedSkus = [...new Set(skus.filter((s) => toOptionalString(s)))];
    if (normalizedSkus.length === 0) {
        throw new Error('No valid SKUs provided for fallback extraction');
    }

    const nowIso = new Date().toISOString();

    // Build items array with URL context per SKU
    const items = normalizedSkus.map((sku) => ({
        sku,
        source_url: options.urlsBySku[sku],
        url_source: options.urlSourceBySku[sku] ?? 'serper',
        brand: options.cohort.brandName,
    }));

    // Build the job config with items and cohort context
    const jobConfig: Record<string, unknown> = {
        items,
        cohort: {
            id: options.cohort.id,
            brandId: options.cohort.brandId,
            brandName: options.cohort.brandName,
            officialDomains: options.cohort.officialDomains ?? [],
            preferredDomains: options.cohort.preferredDomains ?? [],
        },
        // Standard extraction params (runner defaults)
        max_concurrency: 3,
        extraction_strategy: 'llm',
        cache_enabled: true,
        prefer_manufacturer: true,
    };

    // Build job metadata
    const metadata: Record<string, unknown> = {
        pipeline_version: 'static_first_v1',
        orchestration_kind: 'fallback_url_extraction',
        approved_by: options.approvedBy,
        approved_at: nowIso,
        cohort_id: options.cohort.id,
        brand_name: options.cohort.brandName,
    };

    if (options.discoveryJobId) {
        metadata.fallback_discovery_job_id = options.discoveryJobId;
    }

    // Create the scrape job
    const { data: job, error: insertError } = await supabase
        .from('scrape_jobs')
        .insert({
            skus: normalizedSkus,
            scrapers: [],
            test_mode: false,
            max_workers: 3,
            status: 'pending',
            attempt_count: 0,
            max_attempts: 3,
            type: 'direct_url_extraction',
            config: jobConfig,
            metadata,
            items_processed: 0,
            items_total: normalizedSkus.length,
            updated_at: nowIso,
        })
        .select('id')
        .single();

    if (insertError || !job) {
        console.error('[Fallback Orchestration] Failed to create extraction job:', insertError);
        throw new Error(`Failed to create fallback extraction job: ${insertError?.message ?? 'Unknown error'}`);
    }

    // Record extraction job reference in fallback_metadata
    const extractionMetadata: Record<string, unknown> = {
        extraction_job_id: job.id,
        
        extraction_started_at: nowIso,
        orchestration_kind: 'fallback_url_extraction',
        sku_count: normalizedSkus.length,
        cohort_info: {
            cohort_id: options.cohort.id,
            brand_name: options.cohort.brandName,
        },
    };
    await recordFallbackMetadata(supabase, normalizedSkus, extractionMetadata);

    return job.id;
}
