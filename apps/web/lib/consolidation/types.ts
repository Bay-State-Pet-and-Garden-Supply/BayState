/**
 * Consolidation Types
 *
 * Type definitions for the OpenAI Batch API consolidation system.
 * Ported from BayStateTools and adapted for BayStateApp patterns.
 */

import type { LLMProvider } from '@/lib/ai-scraping/credentials';

// =============================================================================
// Execution Mode
// =============================================================================

/**
 * How a batch job is processed by the provider.
 * - 'batch_api': Uses the provider's Batch API (e.g., OpenAI /v1/batches).
 * - 'direct_chat_chunks': Sends individual /v1/chat/completions requests (LM Studio).
 */
export type BatchExecutionMode = 'batch_api' | 'direct_chat_chunks';

// =============================================================================
// Batch Job Types
// =============================================================================

/**
 * Metadata stored with batch jobs.
 */
export interface BatchMetadata {
    description?: string;
    auto_apply?: boolean;
    use_web_search?: boolean;
    [key: string]: string | number | boolean | undefined;
}

/**
 * Status of a batch job from OpenAI API.
 */
export interface BatchStatus {
    id: string;
    status: BatchJobStatus;
    provider?: LLMProvider;
    provider_batch_id?: string | null;
    is_complete: boolean;
    is_failed: boolean;
    is_processing: boolean;
    total_requests: number;
    completed_requests: number;
    failed_requests: number;
    progress_percent: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    created_at: number | null | undefined;
    completed_at: number | null | undefined;
    metadata: BatchMetadata;
}

/**
 * Possible batch job statuses from OpenAI.
 */
type BatchJobStatus =
    | 'validating'
    | 'in_progress'
    | 'finalizing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled'
    | 'pending';

/**
 * Database representation of a batch job (from batch_jobs table).
 */
export interface BatchJob {
    id: string;
    db_id?: string;
    provider: LLMProvider;
    provider_batch_id?: string | null;
    provider_input_file_id?: string | null;
    provider_output_file_id?: string | null;
    provider_error_file_id?: string | null;
    openai_batch_id?: string | null;
    status: string;
    execution_mode: BatchExecutionMode;
    description: string | null;
    auto_apply: boolean;
    total_requests: number;
    completed_requests: number;
    failed_requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    retry_count: number;
    max_retries: number;
    failed_skus: string[] | null;
    parent_batch_id: string | null;
    input_file_id: string | null;
    output_file_id: string | null;
    error_file_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    webhook_received_at: string | null;
    webhook_payload: Record<string, unknown> | null;
}

// =============================================================================
// Product & Consolidation Types
// =============================================================================

/**
 * Product data to be consolidated.
 * Includes optional sibling context for batch processing to ensure consistency
 * across related products from the same product line.
 */
export interface ProductSource {
    sku: string;
    sources: Record<string, unknown>;
    /** Optional context about sibling products from the same product line. */
    productLineContext?: {
        productLine: string;
        siblings: Array<{
            sku: string;
            name: string;
            sources: Record<string, unknown>;
        }>;
        expectedBrand?: string;
        expectedCategory?: string;
    };
}

/**
 * Result of consolidating a product.
 */
export interface ConsolidationResult {
    sku: string;
    name?: string;
    brand?: string;
    description?: string;
    search_keywords?: string;
    weight?: string;
    price?: string;
    category?: string;
    confidence_score?: number;
    error?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Per-SKU work item for a direct-chat consolidation batch.
 */
export interface BatchJobItem {
    id: string;
    batch_job_id: string;
    sku: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    request_payload: Record<string, unknown>;
    response_payload: Record<string, unknown> | null;
    parsed_result: Record<string, unknown> | null;
    product_source: Record<string, unknown>;
    error_message: string | null;
    attempt_count: number;
    fallback_batch_id: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Response from submitting a batch job.
 */
export interface SubmitBatchResponse {
    success: true;
    batch_id: string;
    provider: LLMProvider;
    provider_batch_id: string;
    product_count: number;
    _batch_groups?: Array<{
        batch_id: string;
        product_count: number;
    }>;
    _error_count?: number;
}

/**
 * Error response from batch operations.
 */
export interface BatchErrorResponse {
    success: false;
    error: string;
}

/**
 * Response from applying batch results.
 */
export interface ApplyResultsResponse {
    status: 'applied';
    success_count: number;
    error_count: number;
    total: number;
    quality_metrics?: {
        matched_brand_count: number;
        unresolved_brand_count: number;
        preserved_existing_field_count: number;
        overwritten_field_count: number;
    };
    errors?: string[];
    warnings?: string[];
}

type ParallelRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ParallelRunComparison {
    accuracy: number;
    completeness: number;
    taxonomy_correctness: number;
    mismatch_count: number;
    compared_count: number;
    mismatched_fields: string[];
}

export interface ParallelRunRecord {
    id: string;
    workflow: 'consolidation';
    subject_key: string;
    primary_provider: LLMProvider;
    primary_batch_id: string;
    shadow_provider: LLMProvider;
    shadow_batch_id: string | null;
    sample_percent: number;
    status: ParallelRunStatus;
    primary_summary: Record<string, unknown>;
    shadow_summary: Record<string, unknown>;
    comparison: Record<string, unknown>;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

/**
 * Pipeline status for product ingestion.
 */
export type PipelineStatus =
    | 'imported'
    | 'scraping'
    | 'scraped'
    | 'consolidating'
    | 'finalizing'
    | 'exporting'
    | 'failed';
