import { createClient } from '@/lib/supabase/server';
import {
    PERSISTED_PIPELINE_STATUSES,
    isPersistedStatus,
    type PersistedPipelineStatus,
    type PipelineProduct,
    type SelectedImage,
    type StatusCount,
} from '@/lib/pipeline/types';
import { validateTransition } from '@/lib/pipeline/core';
import { extractImageCandidatesFromSources } from '@/lib/product-sources';

const CANONICAL_PERSISTED_STATUS_LIST = PERSISTED_PIPELINE_STATUSES.map(
    status => `'${status}'`
).join(', ');

function getInvalidTargetStatusError(targetStatus: string): string {
    return `Invalid status transition to '${targetStatus}'. Allowed persisted statuses: ${CANONICAL_PERSISTED_STATUS_LIST}`;
}

/**
 * Validates if a status transition is allowed.
 * @param from - Current status
 * @param to - Target status
 * @returns true if transition is valid, false otherwise
 */
export function validateStatusTransition(
    from: PersistedPipelineStatus,
    to: PersistedPipelineStatus
): boolean {
    return validateTransition(from, to);
}

function toImageUrlArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function withMergedImageCandidates(product: PipelineProduct): PipelineProduct {
    try {
        const consolidatedImages = toImageUrlArray(product.consolidated?.images);
        const storedCandidates = toImageUrlArray(product.image_candidates);
        const sourceCandidates = extractImageCandidatesFromSources(product.sources || {}, 48);

        const mergedCandidates = Array.from(
            new Set([...storedCandidates, ...consolidatedImages, ...sourceCandidates])
        );

        if (mergedCandidates.length === 0) {
            return product;
        }

        return {
            ...product,
            image_candidates: mergedCandidates,
        };
    } catch (error) {
        console.error(`Error merging image candidates for SKU ${product.sku}:`, error);
        return product;
    }
}

/**
 * Fetches products filtered by pipeline status.
 */
export async function getProductsByStatus(
    status: PersistedPipelineStatus,
    options?: {
        limit?: number;
        offset?: number;
        search?: string;
        startDate?: string;
        endDate?: string;
        source?: string;
        minConfidence?: number;
        maxConfidence?: number;
        product_line?: string;
        cohort_id?: string;
    }
): Promise<{ products: PipelineProduct[]; count: number }> {
    const supabase = await createClient();

    let query = supabase
        .from('products_ingestion')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false });

    query = query.eq('pipeline_status', status);

    if (options?.product_line) {
        query = query.eq('product_line', options.product_line);
    }

    if (options?.cohort_id) {
        query = query.eq('cohort_id', options.cohort_id);
    }

    if (options?.search) {
        query = query.or(`sku.ilike.%${options.search}%,input->>name.ilike.%${options.search}%`);
    }

    if (options?.startDate) {
        query = query.gte('updated_at', options.startDate);
    }

    if (options?.endDate) {
        query = query.lte('updated_at', options.endDate);
    }

    if (options?.source) {
        // Check if the source key exists in the sources JSONB column
        // Use the '?' operator for key existence - works regardless of value type
        // (object, string, number, null, array, etc.)
        query = query.filter('sources', '?', options.source);
    }

    if (options?.minConfidence !== undefined) {
        query = query.gte('confidence_score', options.minConfidence);
    }

    if (options?.maxConfidence !== undefined) {
        query = query.lte('confidence_score', options.maxConfidence);
    }

    if (options?.limit) {
        query = query.limit(options.limit);
    }

    if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching products by status:', error);
        return { products: [], count: 0 };
    }

    const products = ((data as PipelineProduct[]) || []).map(withMergedImageCandidates);
    return { products, count: count || 0 };
}

/**
 * Fetches all SKUs matching a pipeline status + filters.
 * Used by "select all matching" flows in the admin pipeline.
 */
export async function getSkusByStatus(
    status: PersistedPipelineStatus,
    options?: {
        search?: string;
        startDate?: string;
        endDate?: string;
        source?: string;
        minConfidence?: number;
        maxConfidence?: number;
        product_line?: string;
        cohort_id?: string;
    }
): Promise<{ skus: string[]; count: number }> {
    const supabase = await createClient();

    let query = supabase
        .from('products_ingestion')
        .select('sku', { count: 'exact' })
        .order('updated_at', { ascending: false });

    query = query.eq('pipeline_status', status);

    if (options?.product_line) {
        query = query.eq('product_line', options.product_line);
    }

    if (options?.cohort_id) {
        query = query.eq('cohort_id', options.cohort_id);
    }

    if (options?.search) {
        query = query.or(`sku.ilike.%${options.search}%,input->>name.ilike.%${options.search}%`);
    }

    if (options?.startDate) {
        query = query.gte('updated_at', options.startDate);
    }

    if (options?.endDate) {
        query = query.lte('updated_at', options.endDate);
    }

    if (options?.source) {
        // Use the '?' operator for key existence - works regardless of value type
        query = query.filter('sources', '?', options.source);
    }

    if (options?.minConfidence !== undefined) {
        query = query.gte('confidence_score', options.minConfidence);
    }

    if (options?.maxConfidence !== undefined) {
        query = query.lte('confidence_score', options.maxConfidence);
    }

    const { data, error, count } = await query;
    if (error) {
        console.error('Error fetching SKUs by status:', error);
        return { skus: [], count: 0 };
    }

    return {
        skus: (data || []).map((row: { sku: string }) => row.sku).filter(Boolean),
        count: count || 0,
    };
}

/**
 * Fetches all unique source keys from the sources JSONB column for a given status.
 */
export async function getAvailableSources(status: PersistedPipelineStatus): Promise<string[]> {
    const supabase = await createClient();

    // Use a raw SQL query via rpc if available, or fetch and process
    // For simplicity and since we don't have a specific RPC, we'll use a trick with select
    // filtering for products that actually have sources.
    const { data, error } = await supabase
        .from('products_ingestion')
        .select('sources')
        .eq('pipeline_status', status)
        .not('sources', 'is', null);

    if (error) {
        console.error('Error fetching available sources:', error);
        return [];
    }

    const allSources = new Set<string>();
    (data || []).forEach((row: { sources: Record<string, unknown> | null }) => {
        if (row.sources && typeof row.sources === 'object') {
            Object.keys(row.sources)
                .filter(key => !key.startsWith('_'))
                .forEach(key => allSources.add(key));
        }
    });

    return Array.from(allSources).sort();
}

/**
 * Fetches count of products for each pipeline status using a single aggregated query.
 * This eliminates the N+1 pattern of making separate queries for each status.
 */
export async function getStatusCounts(): Promise<StatusCount[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('pipeline_status');

    if (error) {
        console.error('Error fetching status counts:', error);
        return PERSISTED_PIPELINE_STATUSES.map(status => ({ status, count: 0 }));
    }

    const countMap: Record<PersistedPipelineStatus, number> = {
        imported: 0,
        scraped: 0,
        finalized: 0,
        failed: 0,
    };

    (data || []).forEach((row: { pipeline_status?: string }) => {
        if (row.pipeline_status && isPersistedStatus(row.pipeline_status)) {
            countMap[row.pipeline_status]++;
        }
    });

    return PERSISTED_PIPELINE_STATUSES.map(status => ({
        status,
        count: countMap[status] || 0,
    }));
}

/**
 * Updates the status of multiple products.
 * @param skus - Array of SKUs to update
 * @param newStatus - Target pipeline status
 * @param userId - ID of the user performing the action (for audit log)
 * @param resetResults - If true, clears data for the stages being left
 */
export async function bulkUpdateStatus(
    skus: string[],
    newStatus: PersistedPipelineStatus,
    userId?: string,
    resetResults: boolean = false
): Promise<{ success: boolean; error?: string; updatedCount: number }> {
    const supabase = await createClient();
    const targetStatus = newStatus;

    if (!isPersistedStatus(targetStatus)) {
        return { success: false, error: getInvalidTargetStatusError(targetStatus), updatedCount: 0 };
    }

    const { data: currentProducts, error: fetchError } = await supabase
        .from('products_ingestion')
        .select('sku, pipeline_status')
        .in('sku', skus);

    if (fetchError) {
        console.error('Error fetching current product statuses:', fetchError);
        return { success: false, error: fetchError.message, updatedCount: 0 };
    }

    const invalidSkus = (currentProducts || [])
        .filter((product: { pipeline_status: string }) => {
            return !isPersistedStatus(product.pipeline_status)
                || !validateStatusTransition(product.pipeline_status, targetStatus);
        })
        .map((product: { sku: string }) => product.sku);

    if (invalidSkus.length > 0) {
        return {
            success: false,
            error: `${getInvalidTargetStatusError(targetStatus)} SKU(s): ${invalidSkus.join(', ')}`,
            updatedCount: 0,
        };
    }

    const updatePayload: {
        pipeline_status: PersistedPipelineStatus;
        updated_at: string;
        sources?: Record<string, unknown>;
        consolidated?: PipelineProduct['consolidated'];
        image_candidates?: string[];
        selected_images?: SelectedImage[];
        confidence_score?: number | null;
        error_message?: string | null;
        retry_count?: number;
    } = {
        pipeline_status: targetStatus,
        updated_at: new Date().toISOString(),
    };

    if (resetResults) {
        if (targetStatus === 'imported') {
            updatePayload.sources = {};
            updatePayload.consolidated = null;
            updatePayload.image_candidates = [];
            updatePayload.selected_images = [];
            updatePayload.confidence_score = null;
            updatePayload.error_message = null;
            updatePayload.retry_count = 0;
        } else if (targetStatus === 'scraped') {
            updatePayload.consolidated = null;
            updatePayload.image_candidates = [];
            updatePayload.selected_images = [];
            updatePayload.confidence_score = null;
            updatePayload.error_message = null;
            updatePayload.retry_count = 0;
        }
    }

    const { error, count } = await supabase
        .from('products_ingestion')
        .update(updatePayload)
        .in('sku', skus);

    if (error) {
        console.error('Error bulk updating product status:', error);
        return { success: false, error: error.message, updatedCount: 0 };
    }

    // Log status update to audit_log
    try {
        const auditPayload = {
            job_type: 'status_update',
            job_id: crypto.randomUUID(),
            from_state: 'various',
            to_state: targetStatus,
            actor_id: userId || null,
            actor_type: userId ? 'user' : 'system',
            metadata: {
                updated_skus: skus,
                updated_count: count || skus.length,
                timestamp: new Date().toISOString(),
            },
        };

        const { error: auditError } = await supabase
            .from('pipeline_audit_log')
            .insert([auditPayload]);

        if (auditError) {
            console.error('Warning: Failed to log status update to audit_log:', auditError);
        }
    } catch (err) {
        console.error('Error logging to audit_log:', err);
    }

    return { success: true, updatedCount: count || skus.length };
}

/**
 * Fetches a single product by SKU.
 */
export async function getProductBySku(sku: string): Promise<PipelineProduct | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('*')
        .eq('sku', sku)
        .single();

    if (error || !data) {
        console.error('Error fetching product by SKU:', error);
        return null;
    }

    return data as PipelineProduct;
}

/**
 * Permanently deletes multiple products (hard delete from database).
 * Logs deletion to pipeline_audit_log for audit trail.
 */
export async function bulkDeleteProducts(
    skus: string[],
    userId?: string
): Promise<{ success: boolean; error?: string; deletedCount: number }> {
    const supabase = await createClient();

    try {
        // Delete products from the database
        const { error: deleteError, count } = await supabase
            .from('products_ingestion')
            .delete()
            .in('sku', skus);

        if (deleteError) {
            console.error('Error deleting products:', deleteError);
            return { success: false, error: deleteError.message, deletedCount: 0 };
        }

        // Log deletion to audit_log (for permanent record of what was deleted)
        const auditPayload = {
            job_type: 'product_deletion',
            job_id: crypto.randomUUID(),
            from_state: 'various',
            to_state: 'deleted',
            actor_id: userId || null,
            actor_type: userId ? 'user' : 'system',
            metadata: {
                deleted_skus: skus,
                deleted_count: count || skus.length,
                timestamp: new Date().toISOString(),
            },
        };

        const { error: auditError } = await supabase
            .from('pipeline_audit_log')
            .insert([auditPayload]);

        if (auditError) {
            console.error('Warning: Failed to log deletion to audit_log:', auditError);
            // Non-fatal: audit log failure shouldn't prevent deletion
        }

        return { success: true, deletedCount: count || skus.length };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during deletion';
        console.error('Error in bulkDeleteProducts:', errorMessage);
        return { success: false, error: errorMessage, deletedCount: 0 };
    }
}

/**
 * Clears scrape results and resets products back to 'imported' status.
 * This removes all scraped source data and consolidated data, allowing products
 * to be retried from scratch.
 */
export async function clearScrapeResultsAndResetStatus(
    skus: string[],
    userId?: string
): Promise<{ success: boolean; error?: string; updatedCount: number }> {
    const supabase = await createClient();

    try {
        // Clear sources (scraped data) and consolidated fields, reset to imported
        const { error, count } = await supabase
            .from('products_ingestion')
            .update({
                pipeline_status: 'imported',
                sources: {},
                consolidated: null,
                image_candidates: [],
                selected_images: [],
                confidence_score: null,
                error_message: null,
                retry_count: 0,
                updated_at: new Date().toISOString(),
            })
            .in('sku', skus);

        if (error) {
            console.error('Error clearing scrape results:', error);
            return { success: false, error: error.message, updatedCount: 0 };
        }

        // Log the action to audit_log
        const auditPayload = {
            job_type: 'clear_scrape_results',
            job_id: crypto.randomUUID(),
            from_state: 'scraped',
            to_state: 'imported',
            actor_id: userId || null,
            actor_type: userId ? 'user' : 'system',
            metadata: {
                cleared_skus: skus,
                cleared_count: count || skus.length,
                timestamp: new Date().toISOString(),
            },
        };

        const { error: auditError } = await supabase
            .from('pipeline_audit_log')
            .insert([auditPayload]);

        if (auditError) {
            console.error('Warning: Failed to log clear_scrape_results to audit_log:', auditError);
        }

        return { success: true, updatedCount: count || skus.length };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during clear scrape results';
        console.error('Error in clearScrapeResultsAndResetStatus:', errorMessage);
        return { success: false, error: errorMessage, updatedCount: 0 };
    }
}

/**
 * Fetches selected images for a product by SKU.
 */
export async function getSelectedImages(sku: string): Promise<SelectedImage[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('selected_images')
        .eq('sku', sku)
        .single();

    if (error || !data) {
        console.error('Error fetching selected images:', error);
        return [];
    }

    return (data.selected_images as SelectedImage[]) || [];
}

/**
 * Sets selected images for a product by SKU.
 * Validates that images are from the product's image_candidates.
 * Max 10 images allowed.
 */
export async function setSelectedImages(
    sku: string,
    imageUrls: string[],
    userId?: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    // Validate max 10 images
    if (imageUrls.length > 10) {
        return { success: false, error: 'Maximum 10 images allowed' };
    }

    try {
        // First, get the product to validate image candidates
        const { data: product, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('image_candidates, selected_images')
            .eq('sku', sku)
            .single();

        if (fetchError || !product) {
            return { success: false, error: 'Product not found' };
        }

        // Validate that all selected images are from image_candidates
        const imageCandidates = Array.isArray(product.image_candidates)
            ? product.image_candidates
            : [];

        for (const url of imageUrls) {
            if (!imageCandidates.includes(url)) {
                return { success: false, error: `Invalid image: ${url} is not in image_candidates` };
            }
        }

        // Build selected_images array with timestamps
        const selectedImages: SelectedImage[] = imageUrls.map((url) => ({
            url,
            selectedAt: new Date().toISOString(),
        }));

        // Update the product
        const { error: updateError } = await supabase
            .from('products_ingestion')
            .update({
                selected_images: selectedImages,
                updated_at: new Date().toISOString(),
            })
            .eq('sku', sku);

        if (updateError) {
            console.error('Error updating selected images:', updateError);
            return { success: false, error: updateError.message };
        }

        // Log to audit_log
        try {
            const auditPayload = {
                job_type: 'image_selection',
                job_id: crypto.randomUUID(),
                from_state: 'scraped',
                to_state: 'scraped',
                actor_id: userId || null,
                actor_type: userId ? 'user' : 'system',
                metadata: {
                    sku,
                    selected_images: selectedImages,
                    timestamp: new Date().toISOString(),
                },
            };

            await supabase.from('pipeline_audit_log').insert([auditPayload]);
        } catch (auditErr) {
            console.error('Warning: Failed to log image selection:', auditErr);
        }

        return { success: true };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error in setSelectedImages:', errorMessage);
        return { success: false, error: errorMessage };
    }
}

// Re-export types from types.ts for convenience
export type { PipelineStatus, PipelineStage, StatusCount, StageConfig, PipelineProduct } from '@/lib/pipeline/types';
