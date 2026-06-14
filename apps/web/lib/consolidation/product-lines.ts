import { createAdminClient } from '@/lib/supabase/server';

export interface ProductLineRecord {
    id: string;
    canonical_name: string;
    normalized_key: string;
    brand_id: string | null;
    created_at: string;
    updated_at: string;
}

/** Normalize a label for dedup matching: lowercase, strip non-alphanumeric, collapse whitespace. */
export function normalizeProductLineKey(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s+/g, '');
}

/** Load all known product lines from the database as classification vocabulary. */
export async function loadKnownProductLines(): Promise<ProductLineRecord[]> {
    const supabase = await createAdminClient();
    const { data } = await supabase
        .from('product_lines')
        .select('id, canonical_name, normalized_key, brand_id, created_at, updated_at')
        .order('canonical_name');
    return (data || []) as ProductLineRecord[];
}

/** Upsert a product line. Returns the existing or new record. */
export async function upsertProductLine(
    canonicalName: string,
    brandId?: string | null
): Promise<ProductLineRecord> {
    const supabase = await createAdminClient();
    const normalizedKey = normalizeProductLineKey(canonicalName);

    const { data: existing } = await supabase
        .from('product_lines')
        .select('*')
        .eq('normalized_key', normalizedKey)
        .maybeSingle();

    if (existing) {
        return existing as ProductLineRecord;
    }

    const { data: created, error } = await supabase
        .from('product_lines')
        .insert({
            canonical_name: canonicalName,
            normalized_key: normalizedKey,
            brand_id: brandId || null,
        })
        .select('*')
        .single();

    if (error) throw error;
    return created as ProductLineRecord;
}

/** Assign a product to a product line. Updates products_ingestion with FK, metadata, and status. */
export async function assignProductToLine(
    upc: string,
    productLineId: string | null,
    metadata: {
        confidence?: number;
        assignmentSource: 'ai' | 'manual' | 'migration';
        rawLabel?: string;
        rationale?: string;
        reviewRequired?: boolean;
        canonicalName?: string;
    }
): Promise<void> {
    const supabase = await createAdminClient();

    const update: Record<string, unknown> = {
        product_line_id: productLineId,
        product_line_confidence: metadata.confidence ?? null,
        product_line_assignment_source: metadata.assignmentSource,
        product_line_raw_label: metadata.rawLabel ?? null,
        product_line_rationale: metadata.rationale ?? null,
        product_line_review_required: metadata.reviewRequired ?? false,
        product_line: metadata.canonicalName ?? null,
    };

    // Move products from 'processed' to 'grouping' regardless of whether
    // a product line was assigned. Ungrouped products (product_line_id = null)
    // also go to grouping so they appear in the Grouping tab for review.
    const { data: product } = await supabase
        .from('products_ingestion')
        .select('pipeline_status')
        .eq('upc', upc)
        .maybeSingle();

    if (product?.pipeline_status === 'processed') {
        update.pipeline_status = 'grouping';
    }

    await supabase
        .from('products_ingestion')
        .update(update)
        .eq('upc', upc);
}
