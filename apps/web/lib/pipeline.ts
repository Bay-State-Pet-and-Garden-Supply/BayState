import { createClient } from '@/lib/supabase/server';

/**
 * Legacy pipeline status types (for backward compatibility during migration).
 * @deprecated Use NewPipelineStatus for new code.
 */
export type PipelineStatus = 'staging' | 'scraped' | 'consolidated' | 'approved' | 'published' | 'failed';

/**
 * New pipeline status types for the redesigned export-focused pipeline.
 */
export type NewPipelineStatus = 'registered' | 'enriched' | 'finalized';

export type TransitionalPipelineStatus = PipelineStatus | NewPipelineStatus;

const LEGACY_TO_NEW_STATUS: Record<PipelineStatus, NewPipelineStatus> = {
    staging: 'registered',
    failed: 'registered',
    scraped: 'enriched',
    consolidated: 'finalized',
    approved: 'finalized',
    published: 'finalized',
};

const NEW_TO_LEGACY_STATUS: Record<NewPipelineStatus, PipelineStatus> = {
    registered: 'staging',
    enriched: 'scraped',
    finalized: 'consolidated',
};

function isNewPipelineStatus(status: TransitionalPipelineStatus): status is NewPipelineStatus {
    return status === 'registered' || status === 'enriched' || status === 'finalized';
}

function toNewPipelineStatus(status: TransitionalPipelineStatus): NewPipelineStatus {
    return isNewPipelineStatus(status) ? status : LEGACY_TO_NEW_STATUS[status];
}

function toLegacyPipelineStatus(status: TransitionalPipelineStatus): PipelineStatus {
    return isNewPipelineStatus(status) ? NEW_TO_LEGACY_STATUS[status] : status;
}

/**
 * Status transition rules for the new pipeline.
 * Defines which status transitions are valid.
 */
export const STATUS_TRANSITIONS: Record<NewPipelineStatus, NewPipelineStatus[]> = {
    registered: ['enriched'],
    enriched: ['finalized'],
    finalized: [], // Terminal state - no outgoing transitions
};

/**
 * Validates if a status transition is allowed.
 * @param from - Current status
 * @param to - Target status
 * @returns true if transition is valid, false otherwise
 */
export function validateStatusTransition(
    from: NewPipelineStatus,
    to: NewPipelineStatus
): boolean {
    if (from === to) return true; // Same status is always valid
    const allowedTransitions = STATUS_TRANSITIONS[from];
    return allowedTransitions.includes(to);
}

/**
 * Represents a selected image with metadata.
 */
export interface SelectedImage {
    url: string;
    selectedAt: string;
}

/**
 * Represents a product in the ingestion pipeline.
 */
export interface PipelineProduct {
    sku: string;
    input: {
        name?: string;
        price?: number;
    };
    sources: Record<string, unknown>;
    image_candidates?: string[];
    selected_images?: SelectedImage[];
    consolidated: {
        name?: string;
        description?: string;
        price?: number;
        images?: string[];
        brand_id?: string;
        stock_status?: string;
        is_featured?: boolean;
    };
    pipeline_status: PipelineStatus;
    pipeline_status_new?: NewPipelineStatus;
    confidence_score?: number;
    error_message?: string;
    retry_count?: number;
    created_at: string;
    updated_at: string;
}

/**
 * Status count for pipeline dashboard.
 */
export interface StatusCount {
    status: TransitionalPipelineStatus;
    count: number;
}

/**
 * Fetches products filtered by pipeline status.
 */
export async function getProductsByStatus(
    status: TransitionalPipelineStatus,
    options?: {
        limit?: number;
        offset?: number;
        search?: string;
        startDate?: string;
        endDate?: string;
        source?: string;
        minConfidence?: number;
        maxConfidence?: number;
    }
): Promise<{ products: PipelineProduct[]; count: number }> {
    const supabase = await createClient();

    let query = supabase
        .from('products_ingestion')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false });

    query = isNewPipelineStatus(status)
        ? query.eq('pipeline_status_new', status)
        : query.eq('pipeline_status', status);

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

    return { products: (data as PipelineProduct[]) || [], count: count || 0 };
}

/**
 * Fetches all SKUs matching a pipeline status + filters.
 * Used by "select all matching" flows in the admin pipeline.
 */
export async function getSkusByStatus(
    status: TransitionalPipelineStatus,
    options?: {
        search?: string;
        startDate?: string;
        endDate?: string;
        source?: string;
        minConfidence?: number;
        maxConfidence?: number;
    }
): Promise<{ skus: string[]; count: number }> {
    const supabase = await createClient();

    let query = supabase
        .from('products_ingestion')
        .select('sku', { count: 'exact' })
        .order('updated_at', { ascending: false });

    query = isNewPipelineStatus(status)
        ? query.eq('pipeline_status_new', status)
        : query.eq('pipeline_status', status);

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
 * Fetches count of products for each pipeline status using a single aggregated query.
 * This eliminates the N+1 pattern of making separate queries for each status.
 */
export async function getStatusCounts(): Promise<StatusCount[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('pipeline_status, pipeline_status_new');

    if (error) {
        console.error('Error fetching status counts:', error);
        const statuses: NewPipelineStatus[] = ['registered', 'enriched', 'finalized'];
        return statuses.map(status => ({ status, count: 0 }));
    }
        console.error('Error fetching status counts:', error);
        const statuses: NewPipelineStatus[] = ['registered', 'enriched', 'finalized'];
        return statuses.map(status => ({ status, count: 0 }));
    }

    const countMap: Record<string, number> = {};
    const statuses: NewPipelineStatus[] = ['registered', 'enriched', 'finalized'];

    statuses.forEach(status => {
        countMap[status] = 0;
    });

    (data || []).forEach((row: { pipeline_status?: PipelineStatus; pipeline_status_new?: NewPipelineStatus | null }) => {
        const status = row.pipeline_status_new ?? (row.pipeline_status ? LEGACY_TO_NEW_STATUS[row.pipeline_status] : undefined);
        if (status && countMap[status] !== undefined) {
            countMap[status]++;
        }
    });

    return statuses.map(status => ({
        status,
        count: countMap[status] || 0,
    }));
}

/**
 * Updates the status of a single product.
 */
export async function updateProductStatus(
    sku: string,
    newStatus: TransitionalPipelineStatus
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const nextNewStatus = toNewPipelineStatus(newStatus);
    const nextLegacyStatus = toLegacyPipelineStatus(newStatus);

    const { error } = await supabase
        .from('products_ingestion')
        .update({
            pipeline_status: nextLegacyStatus,
            pipeline_status_new: nextNewStatus,
            updated_at: new Date().toISOString(),
        })
        .eq('sku', sku);

    if (error) {
        console.error('Error updating product status:', error);
        return { success: false, error: error.message };
    }

    return { success: true };
}

/**
 * Updates the status of multiple products.
 */
export async function bulkUpdateStatus(
    skus: string[],
    newStatus: TransitionalPipelineStatus,
    userId?: string
): Promise<{ success: boolean; error?: string; updatedCount: number }> {
    const supabase = await createClient();
    const nextNewStatus = toNewPipelineStatus(newStatus);
    const nextLegacyStatus = toLegacyPipelineStatus(newStatus);

    const { data: currentProducts, error: fetchError } = await supabase
        .from('products_ingestion')
        .select('sku, pipeline_status, pipeline_status_new')
        .in('sku', skus);

    if (fetchError) {
        console.error('Error fetching current product statuses:', fetchError);
        return { success: false, error: fetchError.message, updatedCount: 0 };
    }

    const invalidSkus = (currentProducts || [])
        .filter((product: { pipeline_status: PipelineStatus; pipeline_status_new?: NewPipelineStatus | null }) => {
            const currentStatus = product.pipeline_status_new ?? LEGACY_TO_NEW_STATUS[product.pipeline_status];
            return !validateStatusTransition(currentStatus, nextNewStatus);
        })
        .map((product: { sku: string }) => product.sku);

    if (invalidSkus.length > 0) {
        return {
            success: false,
            error: `Invalid status transition to ${nextNewStatus} for SKU(s): ${invalidSkus.join(', ')}`,
            updatedCount: 0,
        };
    }

    const { error, count } = await supabase
        .from('products_ingestion')
        .update({
            pipeline_status: nextLegacyStatus,
            pipeline_status_new: nextNewStatus,
            updated_at: new Date().toISOString(),
        })
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
            to_state: nextNewStatus,
            actor_id: userId || null,
            actor_type: userId ? 'user' : 'system',
            metadata: {
                updated_skus: skus,
                updated_count: count || skus.length,
                legacy_status_written: nextLegacyStatus,
                new_status_written: nextNewStatus,
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
 * Bulk action to move multiple products to 'enriched' status.
 * Validates all transitions before executing (all-or-nothing).
 * Only products in 'registered' status can move to 'enriched'.
 * Uses dual-write pattern (pipeline_status + pipeline_status_new).
 */
export async function moveToEnriched(
    skus: string[],
    userId?: string
): Promise<{
    success: boolean;
    error?: string;
    updatedCount: number;
    invalidSkus?: string[];
}> {
    const supabase = await createClient();
    const targetStatus: NewPipelineStatus = 'enriched';
    const legacyTargetStatus = toLegacyPipelineStatus(targetStatus);

    // Fetch current statuses for all SKUs
    const { data: currentProducts, error: fetchError } = await supabase
        .from('products_ingestion')
        .select('sku, pipeline_status, pipeline_status_new')
        .in('sku', skus);

    if (fetchError) {
        console.error('Error fetching current product statuses:', fetchError);
        return { success: false, error: fetchError.message, updatedCount: 0 };
    }

    // Validate all transitions before updating any (all-or-nothing)
    const invalidSkus: string[] = [];
    (currentProducts || []).forEach((product: { sku: string; pipeline_status: PipelineStatus; pipeline_status_new?: NewPipelineStatus | null }) => {
        const currentStatus = product.pipeline_status_new ?? LEGACY_TO_NEW_STATUS[product.pipeline_status];
        if (!validateStatusTransition(currentStatus, targetStatus)) {
            invalidSkus.push(product.sku);
        }
    });

    // If ANY invalid, return error with list of invalid SKUs (all-or-nothing)
    if (invalidSkus.length > 0) {
        return {
            success: false,
            error: `Cannot move to 'enriched': products must be in 'registered' status. Invalid SKU(s): ${invalidSkus.join(', ')}`,
            updatedCount: 0,
            invalidSkus,
        };
    }

    // All valid - update all SKUs to 'enriched'
    const { error: updateError, count } = await supabase
        .from('products_ingestion')
        .update({
            pipeline_status: legacyTargetStatus,
            pipeline_status_new: targetStatus,
            updated_at: new Date().toISOString(),
        })
        .in('sku', skus);

    if (updateError) {
        console.error('Error moving products to enriched:', updateError);
        return { success: false, error: updateError.message, updatedCount: 0 };
    }

    // Log to audit_log
    try {
        const auditPayload = {
            job_type: 'bulk_action',
            job_id: crypto.randomUUID(),
            from_state: 'registered',
            to_state: targetStatus,
            actor_id: userId || null,
            actor_type: userId ? 'user' : 'system',
            metadata: {
                action: 'moveToEnriched',
                updated_skus: skus,
                updated_count: count || skus.length,
                legacy_status_written: legacyTargetStatus,
                new_status_written: targetStatus,
                timestamp: new Date().toISOString(),
            },
        };

        const { error: auditError } = await supabase
            .from('pipeline_audit_log')
            .insert([auditPayload]);

        if (auditError) {
            console.error('Warning: Failed to log moveToEnriched to audit_log:', auditError);
        }
    } catch (err) {
        console.error('Error logging to audit_log:', err);
    }

    return { success: true, updatedCount: count || skus.length };
}

/**
 * Bulk action to move multiple products to 'finalized' status.
 * Validates all transitions before executing (all-or-nothing).
 * Only products in 'enriched' status can move to 'finalized'.
 * Uses dual-write pattern (pipeline_status + pipeline_status_new).
 */
export async function moveToFinalized(
    skus: string[],
    userId?: string
): Promise<{
    success: boolean;
    error?: string;
    updatedCount: number;
    invalidSkus?: string[];
}> {
    const supabase = await createClient();
    const targetStatus: NewPipelineStatus = 'finalized';
    const legacyTargetStatus = toLegacyPipelineStatus(targetStatus);

    // Fetch current statuses for all SKUs
    const { data: currentProducts, error: fetchError } = await supabase
        .from('products_ingestion')
        .select('sku, pipeline_status, pipeline_status_new')
        .in('sku', skus);

    if (fetchError) {
        console.error('Error fetching current product statuses:', fetchError);
        return { success: false, error: fetchError.message, updatedCount: 0 };
    }

    // Validate all transitions before updating any (all-or-nothing)
    const invalidSkus: string[] = [];
    (currentProducts || []).forEach((product: { sku: string; pipeline_status: PipelineStatus; pipeline_status_new?: NewPipelineStatus | null }) => {
        const currentStatus = product.pipeline_status_new ?? LEGACY_TO_NEW_STATUS[product.pipeline_status];
        if (!validateStatusTransition(currentStatus, targetStatus)) {
            invalidSkus.push(product.sku);
        }
    });

    // If ANY invalid, return error with list of invalid SKUs (all-or-nothing)
    if (invalidSkus.length > 0) {
        return {
            success: false,
            error: `Cannot move to 'finalized': products must be in 'enriched' status. Invalid SKU(s): ${invalidSkus.join(', ')}`,
            updatedCount: 0,
            invalidSkus,
        };
    }

    // All valid - update all SKUs to 'finalized'
    const { error: updateError, count } = await supabase
        .from('products_ingestion')
        .update({
            pipeline_status: legacyTargetStatus,
            pipeline_status_new: targetStatus,
            updated_at: new Date().toISOString(),
        })
        .in('sku', skus);

    if (updateError) {
        console.error('Error moving products to finalized:', updateError);
        return { success: false, error: updateError.message, updatedCount: 0 };
    }

    // Log to audit_log
    try {
        const auditPayload = {
            job_type: 'bulk_action',
            job_id: crypto.randomUUID(),
            from_state: 'enriched',
            to_state: targetStatus,
            actor_id: userId || null,
            actor_type: userId ? 'user' : 'system',
            metadata: {
                action: 'moveToFinalized',
                updated_skus: skus,
                updated_count: count || skus.length,
                legacy_status_written: legacyTargetStatus,
                new_status_written: targetStatus,
                timestamp: new Date().toISOString(),
            },
        };

        const { error: auditError } = await supabase
            .from('pipeline_audit_log')
            .insert([auditPayload]);

        if (auditError) {
            console.error('Warning: Failed to log moveToFinalized to audit_log:', auditError);
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
 * Clears scrape results and resets products back to staging (imported) status.
 * This removes all scraped source data and consolidated data, allowing products
 * to be re-enhanced from scratch.
 */
export async function clearScrapeResultsAndResetStatus(
    skus: string[],
    userId?: string
): Promise<{ success: boolean; error?: string; updatedCount: number }> {
    const supabase = await createClient();

    try {
        // Clear sources (scraped data) and consolidated fields, reset to staging
        // Only update fields that are known to exist in the schema
        const { error, count } = await supabase
            .from('products_ingestion')
            .update({
                pipeline_status: 'staging',
                pipeline_status_new: 'registered',
                sources: {},
                consolidated: {},
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
            to_state: 'staging',
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
