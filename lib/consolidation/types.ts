/**
 * Consolidation Types
 *
 * Type definitions for the OpenAI Batch API consolidation system.
 * Ported from BayStateTools and adapted for BayStateApp patterns.
 */

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
    [key: string]: string | boolean | undefined;
}

/**
 * Status of a batch job from OpenAI API.
 */
export interface BatchStatus {
    id: string;
    status: BatchJobStatus;
    is_complete: boolean;
    is_failed: boolean;
    is_processing: boolean;
    total_requests: number;
    completed_requests: number;
    failed_requests: number;
    progress_percent: number;
    created_at: number | null | undefined;
    completed_at: number | null | undefined;
    metadata: BatchMetadata;
}

/**
 * Possible batch job statuses from OpenAI.
 */
export type BatchJobStatus =
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
    status: string;
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
 */
export interface ProductSource {
    sku: string;
    sources: Record<string, unknown>;
}

/**
 * Result of consolidating a product.
 */
export interface ConsolidationResult {
    sku: string;
    name?: string;
    brand?: string;
    weight?: string;
    price?: string;
    category?: string;
    product_type?: string;
    product_on_pages?: string;
    description?: string;
    confidence_score?: number;
    error?: string;
}

/**
 * Consolidated product data stored in products_ingestion.consolidated.
 */
export interface ConsolidatedData {
    name?: string;
    description?: string;
    price?: number;
    images?: string[];
    brand_id?: string;
    stock_status?: string;
    is_featured?: boolean;
    category?: string;
    product_type?: string;
    weight?: string;
    confidence_score?: number;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Response from submitting a batch job.
 */
export interface SubmitBatchResponse {
    success: true;
    batch_id: string;
    product_count: number;
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
    errors?: string[];
}

// =============================================================================
// Taxonomy Types
// =============================================================================

/**
 * Category from the categories table.
 */
export interface Category {
    id: string;
    name: string;
    slug: string | null;
}

/**
 * Product type from the product_types table.
 */
export interface ProductType {
    id: string;
    name: string;
}

/**
 * Pipeline status for product ingestion.
 */
export type PipelineStatus = 'pending' | 'consolidated' | 'approved' | 'flagged' | 'failed';
