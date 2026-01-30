import { createClient } from '@/lib/supabase/server';

/**
 * Pipeline status types matching the database constraint.
 */
export type PipelineStatus = 'staging' | 'scraped' | 'consolidated' | 'approved' | 'published' | 'failed';

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
    status: PipelineStatus;
    count: number;
}

/**
 * Fetches products filtered by pipeline status.
 */
export async function getProductsByStatus(
    status: PipelineStatus,
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
        .eq('pipeline_status', status)
        .order('updated_at', { ascending: false });

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
        // We use the contains operator @> with a partial object
        // Note: This assumes the source value is an object. If it can be anything, this might need adjustment.
        // But based on Record<string, unknown>, it's likely an object map.
        // A safer way to check for key existence in JSONB in Supabase/PostgREST is tricky without raw SQL.
        // However, if we assume standard usage where sources are keyed by scraper/feed ID:
        // We can try to match any non-null value for that key?
        // Actually, let's try the simple contains approach first.
        query = query.contains('sources', { [options.source]: {} });
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
 * Fetches count of products for each pipeline status using a single aggregated query.
 * This eliminates the N+1 pattern of making separate queries for each status.
 */
export async function getStatusCounts(): Promise<StatusCount[]> {
    const supabase = await createClient();

    // Use a single query to get all counts at once
    // We fetch all pipeline_status values and count them in JavaScript
    // This is more efficient than 5 separate count queries
    const { data, error } = await supabase
        .from('products_ingestion')
        .select('pipeline_status');

    if (error) {
        console.error('Error fetching status counts:', error);
        // Return zero counts for all statuses on error
        const statuses: PipelineStatus[] = ['staging', 'scraped', 'consolidated', 'approved', 'published'];
        return statuses.map(status => ({ status, count: 0 }));
    }

    // Count occurrences of each status
    const countMap: Record<string, number> = {};
    const statuses: PipelineStatus[] = ['staging', 'scraped', 'consolidated', 'approved', 'published'];
    
    // Initialize all statuses with 0
    statuses.forEach(status => {
        countMap[status] = 0;
    });

    // Count each status from the data
    (data || []).forEach(row => {
        const status = row.pipeline_status;
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
    newStatus: PipelineStatus
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('products_ingestion')
        .update({ pipeline_status: newStatus, updated_at: new Date().toISOString() })
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
    newStatus: PipelineStatus,
    userId?: string
): Promise<{ success: boolean; error?: string; updatedCount: number }> {
    const supabase = await createClient();

    const { error, count } = await supabase
        .from('products_ingestion')
        .update({ pipeline_status: newStatus, updated_at: new Date().toISOString() })
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
            to_state: newStatus,
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

