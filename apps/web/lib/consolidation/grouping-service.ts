/**
 * Grouping Service
 *
 * Finalizes classification results and provides manual product line operations.
 *
 * Orchestrates the flow after classification batch completion:
 * 1. Reads parsed results from batch_job_items (raw JSONB with product_line/confidence/rationale)
 * 2. Runs fuzzy dedup to normalize near-identical labels
 * 3. Upserts canonical product_lines rows
 * 4. Updates products_ingestion with product_line_id and metadata
 * 5. Sets pipeline_status to 'grouping' for classified products
 *
 * Also exposes manual operators for the Grouping stage UI:
 *   - reassignProductsToLine  — move UPCs to a different line (or ungroup)
 *   - mergeProductLines       — collapse two lines into one
 *   - splitProductLine        — create a new line from selected UPCs
 *   - renameProductLine       — change a line's canonical name
 */

import { createAdminClient } from '@/lib/supabase/server';
import {
    assignProductToLine,
    upsertProductLine,
    normalizeProductLineKey,
    type ProductLineRecord,
} from './product-lines';
import { deduplicateProductLines } from './product-line-dedup';
import { isConfidentClassification } from './product-line-classification';
import type { ProductLineClassificationResult } from './types';

// =============================================================================
// Result Types
// =============================================================================

export interface GroupingFinalizeResult {
    /** Total products processed in this batch. */
    totalClassified: number;
    /** Products successfully assigned to a product line (confidence >= 0.80). */
    assignedCount: number;
    /** Products marked as ungrouped (below threshold, failed, or no output). */
    ungroupedCount: number;
    /** Number of distinct product lines created or matched. */
    productLinesCount: number;
    /** Products flagged for operator review (ambiguous dedup). */
    reviewRequiredCount: number;
    /** Non-fatal errors collected during finalization. */
    errors: string[];
}

// =============================================================================
// Classification Finalization
// =============================================================================

/**
 * Finalize a completed classification batch.
 *
 * @param batchId - The classification batch_jobs id.
 * @param brandId - Optional brand FK to scope new product lines.
 */
export async function finalizeClassificationBatch(
    batchId: string,
    brandId?: string | null,
): Promise<GroupingFinalizeResult> {
    const supabase = await createAdminClient();
    const errors: string[] = [];

    // 1. Fetch items directly from batch_job_items.
    //    retrieveResults() parses via ConsolidationResult schema, but classification
    //    items store ProductLineClassificationResult ({ product_line, confidence, rationale })
    //    in their parsed_result JSONB.
    const { data: items, error: fetchError } = await supabase
        .from('batch_job_items')
        .select('upc, status, parsed_result, error_message')
        .eq('batch_job_id', batchId);

    if (fetchError || !items) {
        return {
            totalClassified: 0,
            assignedCount: 0,
            ungroupedCount: 0,
            productLinesCount: 0,
            reviewRequiredCount: 0,
            errors: [fetchError?.message ?? 'No items found for batch'],
        };
    }

    // 2. Parse items into raw assignments.
    const rawAssignments = new Map<string, string>();   // upc → raw label
    const upcMetas = new Map<string, { rawLabel: string; confidence: number; rationale: string }>();
    let totalClassified = 0;
    let ungroupedCount = 0;

    for (const item of items) {
        totalClassified++;

        if (item.status === 'failed' || !item.parsed_result) {
            ungroupedCount++;
            await assignProductToLine(item.upc, null, {
                assignmentSource: 'ai',
                confidence: 0,
                rawLabel: item.error_message ?? 'Classification failed',
                rationale: item.error_message ?? 'No result produced',
                canonicalName: undefined,
            });
            continue;
        }

        const parsed = item.parsed_result as Record<string, unknown>;
        const rawLabel =
            typeof parsed.product_line === 'string' && parsed.product_line.trim().length > 0
                ? parsed.product_line.trim()
                : null;
        const confidence =
            typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
                ? parsed.confidence
                : typeof parsed.confidence === 'string'
                    ? parseFloat(parsed.confidence)
                    : 0;
        const rationale =
            typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '';

        if (!rawLabel) {
            ungroupedCount++;
            await assignProductToLine(item.upc, null, {
                assignmentSource: 'ai',
                confidence: 0,
                rawLabel: null as any,
                rationale: rationale || 'No product line name in classification output',
                canonicalName: undefined,
            });
            continue;
        }

        const classificationResult: ProductLineClassificationResult = {
            upc: item.upc,
            product_line: rawLabel,
            confidence,
            rationale,
        };

        if (!isConfidentClassification(classificationResult)) {
            ungroupedCount++;
            await assignProductToLine(item.upc, null, {
                assignmentSource: 'ai',
                confidence,
                rawLabel,
                rationale: rationale || `Confidence ${confidence.toFixed(2)} below threshold 0.80`,
                canonicalName: rawLabel,
            });
            continue;
        }

        rawAssignments.set(item.upc, rawLabel);
        upcMetas.set(item.upc, { rawLabel, confidence, rationale });
    }

    // 3. If nothing was confidently classified, return early (no dedup or line creation needed).
    if (rawAssignments.size === 0) {
        return {
            totalClassified,
            assignedCount: 0,
            ungroupedCount,
            productLinesCount: 0,
            reviewRequiredCount: 0,
            errors,
        };
    }

    // 4. Run fuzzy dedup across raw labels.
    const { canonicalLabels, ambiguousUpcs } = await deduplicateProductLines(
        rawAssignments,
        brandId,
    );

    // 5. Assign each UPC to its canonical product line.
    let assignedCount = 0;
    let reviewRequiredCount = 0;

    for (const [upc, rawLabel] of rawAssignments) {
        const meta = upcMetas.get(upc);
        if (!meta) {
            ungroupedCount++;
            continue;
        }

        const normalizedKey = normalizeProductLineKey(rawLabel);
        const line = canonicalLabels.get(normalizedKey);

        if (!line) {
            // This should not happen — dedup creates a record for every distinct normalized key.
            ungroupedCount++;
            errors.push(`${upc}: no product line record after dedup for "${rawLabel}"`);
            continue;
        }

        const isAmbiguous = ambiguousUpcs.has(upc);

        await assignProductToLine(upc, line.id, {
            assignmentSource: 'ai',
            confidence: meta.confidence,
            rawLabel: meta.rawLabel,
            rationale: meta.rationale,
            reviewRequired: isAmbiguous,
            canonicalName: line.canonical_name,
        });

        assignedCount++;
        if (isAmbiguous) reviewRequiredCount++;
    }

    return {
        totalClassified,
        assignedCount,
        ungroupedCount,
        productLinesCount: canonicalLabels.size,
        reviewRequiredCount,
        errors,
    };
}

// =============================================================================
// Manual Operations (operator-driven in the Grouping stage UI)
// =============================================================================

/**
 * Move one or more UPCs to a different product line, or clear their assignment
 * (ungroup them) by passing null for targetProductLineId.
 */
export async function reassignProductsToLine(
    upcs: string[],
    targetProductLineId: string | null,
    canonicalName?: string,
): Promise<void> {
    let displayName = canonicalName;

    if (targetProductLineId && !displayName) {
        const supabase = await createAdminClient();
        const { data: pl } = await supabase
            .from('product_lines')
            .select('canonical_name')
            .eq('id', targetProductLineId)
            .single();
        displayName = pl?.canonical_name;
    }

    for (const upc of upcs) {
        await assignProductToLine(upc, targetProductLineId, {
            assignmentSource: 'manual',
            confidence: undefined,
            rawLabel: undefined,
            rationale: undefined,
            reviewRequired: false,
            canonicalName: displayName,
        });
    }
}

/**
 * Merge a source product line into a target product line.
 * Moves all products assigned to sourceProductLineId into targetProductLineId,
 * then deletes the source line if it becomes empty.
 */
export async function mergeProductLines(
    sourceProductLineId: string,
    targetProductLineId: string,
): Promise<{ movedCount: number }> {
    const supabase = await createAdminClient();

    const { data: target } = await supabase
        .from('product_lines')
        .select('canonical_name')
        .eq('id', targetProductLineId)
        .single();

    if (!target) {
        throw new Error('Target product line not found');
    }

    // Fetch current products on the source line
    const { data: products } = await supabase
        .from('products_ingestion')
        .select('upc')
        .eq('product_line_id', sourceProductLineId);

    if (products && products.length > 0) {
        await reassignProductsToLine(
            products.map((p) => p.upc),
            targetProductLineId,
            target.canonical_name,
        );
    }

    // Clean up if source line is now empty
    const { count } = await supabase
        .from('products_ingestion')
        .select('upc', { count: 'exact', head: true })
        .eq('product_line_id', sourceProductLineId);

    if (count === 0) {
        const { error: deleteError } = await supabase
            .from('product_lines')
            .delete()
            .eq('id', sourceProductLineId);

        if (deleteError) {
            console.warn(
                '[mergeProductLines] Failed to delete empty source product line:',
                deleteError.message,
            );
        }
    }

    return { movedCount: products?.length ?? 0 };
}

/**
 * Split selected UPCs from their current product line into a new product line.
 */
export async function splitProductLine(
    upcs: string[],
    newProductLineName: string,
): Promise<{ productLineId: string; movedCount: number }> {
    const line = await upsertProductLine(newProductLineName);
    await reassignProductsToLine(upcs, line.id, line.canonical_name);
    return { productLineId: line.id, movedCount: upcs.length };
}

/**
 * Rename a product line. Updates the canonical name and normalized key on the
 * product_lines row, then refreshes denormalized product_line text on every
 * associated products_ingestion row.
 */
export async function renameProductLine(
    productLineId: string,
    newName: string,
): Promise<void> {
    const supabase = await createAdminClient();
    const normalizedKey = normalizeProductLineKey(newName);

    const { error: updateError } = await supabase
        .from('product_lines')
        .update({
            canonical_name: newName,
            normalized_key: normalizedKey,
        })
        .eq('id', productLineId);

    if (updateError) {
        throw new Error(`Failed to rename product line: ${updateError.message}`);
    }

    // Refresh the denormalized display label on every product assigned to this line
    const { error: denormError } = await supabase
        .from('products_ingestion')
        .update({ product_line: newName })
        .eq('product_line_id', productLineId);

    if (denormError) {
        console.warn(
            '[renameProductLine] Failed to refresh denormalized product_line:',
            denormError.message,
        );
    }
}
