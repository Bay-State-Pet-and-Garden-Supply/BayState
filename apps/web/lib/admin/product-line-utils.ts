/**
 * Product Line Utilities
 *
 * Replaces cohort-based grouping (cohort-utils.ts) with Product Group assignment
 * via the product_lines table. Products are grouped by their product_line_id FK.
 *
 * @see docs/adr/0004-group-based-consolidation.md
 */

import type { SupabaseClient } from '@/lib/supabase/server';

/**
 * A sentinel key for products that have no product_line_id assignment.
 * These are treated as Ungrouped (Singletons for consolidation).
 */
const UNGROUPED_KEY = '__ungrouped__';

/**
 * Group products by their assigned product_line_id.
 *
 * Products without a product_line_id are collected under the UNGROUPED_KEY sentinel.
 *
 * @param upcs - The UPCs to group
 * @param upcToLineId - Map of UPC -> product_line_id (or null for unassigned)
 * @returns Map of product_line_id (or UNGROUPED_KEY) -> UPC[]
 */
export function groupUpcsByProductLine(
    upcs: string[],
    upcToLineId: Map<string, string | null>
): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const upc of upcs) {
        const lineId = upcToLineId.get(upc) || UNGROUPED_KEY;
        const existing = groups.get(lineId);
        if (existing) {
            existing.push(upc);
        } else {
            groups.set(lineId, [upc]);
        }
    }

    return groups;
}

/**
 * Load product_line_id assignments for a set of UPCs.
 *
 * @param supabase - Authenticated Supabase client
 * @param upcs - The UPCs to look up
 * @returns Map of UPC -> product_line_id (or null if not assigned)
 */
export async function loadProductLineAssignments(
    supabase: SupabaseClient,
    upcs: string[]
): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();

    if (upcs.length === 0) {
        return result;
    }

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('upc, product_line_id')
        .in('upc', upcs);

    if (error) {
        console.error('[product-line-utils] Failed to load product line assignments:', error);
        return result;
    }

    for (const row of data || []) {
        result.set(row.upc, row.product_line_id || null);
    }

    // Ensure every requested UPC is represented (defaults to null)
    for (const upc of upcs) {
        if (!result.has(upc)) {
            result.set(upc, null);
        }
    }

    return result;
}

/**
 * Get product line metadata for a set of IDs.
 *
 * @param supabase - Authenticated Supabase client
 * @param lineIds - Product line UUIDs to look up
 * @returns Map of product_line_id -> { id, canonical_name, normalized_key }
 */
export async function loadProductLineMetadata(
    supabase: SupabaseClient,
    lineIds: string[]
): Promise<Map<string, { id: string; canonical_name: string; normalized_key: string }>> {
    const result = new Map<string, { id: string; canonical_name: string; normalized_key: string }>();

    if (lineIds.length === 0) {
        return result;
    }

    const { data, error } = await supabase
        .from('product_lines')
        .select('id, canonical_name, normalized_key')
        .in('id', lineIds);

    if (error) {
        console.error('[product-line-utils] Failed to load product line metadata:', error);
        return result;
    }

    for (const row of data || []) {
        result.set(row.id, {
            id: row.id,
            canonical_name: row.canonical_name,
            normalized_key: row.normalized_key,
        });
    }

    return result;
}
