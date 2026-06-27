import { createAdminClient } from '@/lib/supabase/server';
import { upsertProductLine, type ProductLineRecord } from './product-lines';
import { checkFuzzyMatch, normalizeProductLineKey } from './product-line-matcher';

export interface DedupResult {
    /** Canonical labels after dedup (one per distinct product line). */
    canonicalLabels: Map<string, ProductLineRecord>;
    /** UPCs that have ambiguous assignments needing operator review. */
    ambiguousUpcs: Set<string>;
}

/**
 * Run post-classification fuzzy dedup on a set of raw assignments.
 * Compares new raw labels against each other and against existing product lines in the DB.
 */
export async function deduplicateProductLines(
    rawAssignments: Map<string, string>,
    brandId?: string | null
): Promise<DedupResult> {
    const canonicalLabels = new Map<string, ProductLineRecord>();
    const ambiguousUpcs = new Set<string>();

    const entries = Array.from(rawAssignments.entries());
    const normalizedKeys = new Map<string, string>();
    const newKeyToDisplayName = new Map<string, string>();

    for (const [upc, rawLabel] of entries) {
        const normKey = normalizeProductLineKey(rawLabel);
        normalizedKeys.set(upc, normKey);
        if (!newKeyToDisplayName.has(normKey)) {
            newKeyToDisplayName.set(normKey, rawLabel);
        }
    }

    // Group by normalized key
    const groups = new Map<string, string[]>();
    for (const [upc, key] of normalizedKeys) {
        const existing = groups.get(key) || [];
        existing.push(upc);
        groups.set(key, existing);
    }

    const distinctKeys = Array.from(groups.keys());

    // 1. Load existing product lines from the database for this brand (or all if brandId is null)
    const supabase = await createAdminClient();
    let dbQuery = supabase.from('product_lines').select('*');
    if (brandId) {
        dbQuery = dbQuery.or(`brand_id.eq.${brandId},brand_id.is.null`);
    }
    const { data: dbLines } = await dbQuery;
    const existingProductLines = (dbLines || []) as ProductLineRecord[];

    // 2. Map new keys to existing DB product lines if a close match exists
    const mergedToDb = new Map<string, ProductLineRecord>(); // new_normalized_key -> existing_record

    for (const newKey of distinctKeys) {
        let bestMatch: ProductLineRecord | null = null;
        let bestSimilarity = 0;
        let bestAutoMerge = false;

        for (const existingLine of existingProductLines) {
            const existingKey = existingLine.normalized_key;
            const match = checkFuzzyMatch(
                newKey,
                existingKey,
                newKeyToDisplayName.get(newKey),
                existingLine.canonical_name
            );

            if (match.autoMerge) {
                if (!bestAutoMerge || match.similarity > bestSimilarity) {
                    bestSimilarity = match.similarity;
                    bestMatch = existingLine;
                    bestAutoMerge = true;
                }
            } else if (match.similarity >= 0.80 && !bestAutoMerge) {
                if (match.similarity > bestSimilarity) {
                    bestSimilarity = match.similarity;
                    bestMatch = existingLine;
                }
            }
        }

        if (bestMatch) {
            if (bestAutoMerge) {
                mergedToDb.set(newKey, bestMatch);
                canonicalLabels.set(newKey, bestMatch);
            } else {
                // Flag all UPCs for this key as ambiguous
                const upcs = groups.get(newKey) || [];
                for (const upc of upcs) {
                    ambiguousUpcs.add(upc);
                }
                // Still register them under the match as fallback
                mergedToDb.set(newKey, bestMatch);
                canonicalLabels.set(newKey, bestMatch);
            }
        }
    }

    // 3. For any keys NOT merged to DB, perform batch-local deduplication
    const unmergedKeys = distinctKeys.filter(k => !mergedToDb.has(k));
    const clusters: Array<{ representative: string; keys: string[]; isAmbiguous: boolean }> = [];

    for (const key of unmergedKeys) {
        let matchedCluster: typeof clusters[0] | null = null;
        let bestSimilarity = 0;
        let bestAutoMerge = false;

        for (const cluster of clusters) {
            const match = checkFuzzyMatch(
                key,
                cluster.representative,
                newKeyToDisplayName.get(key),
                newKeyToDisplayName.get(cluster.representative)
            );
            if (match.autoMerge) {
                if (!bestAutoMerge || match.similarity > bestSimilarity) {
                    bestSimilarity = match.similarity;
                    matchedCluster = cluster;
                    bestAutoMerge = true;
                }
            } else if (match.similarity >= 0.80 && !bestAutoMerge) {
                if (match.similarity > bestSimilarity) {
                    bestSimilarity = match.similarity;
                    matchedCluster = cluster;
                }
            }
        }

        if (matchedCluster) {
            matchedCluster.keys.push(key);
            if (!bestAutoMerge) {
                matchedCluster.isAmbiguous = true;
            }
        } else {
            clusters.push({
                representative: key,
                keys: [key],
                isAmbiguous: false,
            });
        }
    }

    // 4. Upsert any brand new canonical product lines and map all keys in clusters
    for (const cluster of clusters) {
        const canonicalKey = cluster.representative;
        const upcs = groups.get(canonicalKey) || [];
        const displayName = upcs.length > 0
            ? rawAssignments.get(upcs[0]) || canonicalKey
            : canonicalKey;

        const record = await upsertProductLine(displayName, brandId);

        for (const key of cluster.keys) {
            canonicalLabels.set(key, record);
            
            if (cluster.isAmbiguous) {
                const keyUpcs = groups.get(key) || [];
                for (const upc of keyUpcs) {
                    ambiguousUpcs.add(upc);
                }
            }
        }
    }

    return { canonicalLabels, ambiguousUpcs };
}
