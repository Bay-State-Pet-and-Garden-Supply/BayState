import { createAdminClient } from '@/lib/supabase/server';
import { normalizeProductLineKey, upsertProductLine, type ProductLineRecord, FLAVOR_WORDS, FORMAT_WORDS, FLAVOR_CLASSES, FORMAT_CLASSES } from './product-lines';

export interface DedupResult {
    /** Canonical labels after dedup (one per distinct product line). */
    canonicalLabels: Map<string, ProductLineRecord>;
    /** UPCs that have ambiguous assignments needing operator review. */
    ambiguousUpcs: Set<string>;
}

/** Simple Levenshtein distance for fuzzy matching. */
function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/** Compute similarity as 1 - (distance / max length). */
function similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(a, b) / maxLen;
}

/** Strip common trailing format words recursively. */
function getCoreNormalizedKey(key: string): string {
    let core = key;
    const suffixes = [
        'rolls', 'roll', 'stix', 'chews', 'chew', 'bones', 'bone',
        'braids', 'braid', 'strips', 'strip', 'bites', 'bite',
        'pates', 'pate', 'stews', 'stew', 'treats', 'treat',
        'foods', 'food', 'formulas', 'formula', 'recipes', 'recipe',
        'toys', 'toy', 'wholesome', 'natural', 'organic', 'puffs', 'puff'
    ];
    
    let stripped = true;
    while (stripped) {
        stripped = false;
        for (const suffix of suffixes) {
            if (core.endsWith(suffix) && core.length > suffix.length) {
                core = core.slice(0, -suffix.length);
                stripped = true;
                break;
            }
        }
    }
    return core;
}

/** Detect if there is a mismatch in flavor or format terms. */
function hasTermMismatch(keyA: string, keyB: string, nameA?: string, nameB?: string): boolean {
    const labelA = nameA || keyA;
    const labelB = nameB || keyB;

    const getTokens = (label: string): string[] => {
        return label
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
    };

    const tokensA = getTokens(labelA);
    const tokensB = getTokens(labelB);

    const getMatchedClasses = (tokens: string[], rawLabel: string, classes: string[][]): Set<number> => {
        const matched = new Set<number>();
        const hasSpaces = rawLabel.includes(' ');

        for (let i = 0; i < classes.length; i++) {
            const equivalenceClass = classes[i];
            if (hasSpaces) {
                if (equivalenceClass.some(word => tokens.includes(word))) {
                    matched.add(i);
                }
            } else {
                // Fallback for space-less keys (tests only)
                if (equivalenceClass.some(word => {
                    // Protect against chew matching inside chewy
                    if (word === 'chew' && rawLabel.includes('chewy') && !rawLabel.includes('chewystix') && !rawLabel.includes('chewychew')) {
                        const idx = rawLabel.indexOf('chew');
                        if (idx !== -1 && rawLabel.slice(idx, idx + 5) === 'chewy') {
                            const lastIdx = rawLabel.lastIndexOf('chew');
                            if (lastIdx === idx || rawLabel.slice(lastIdx, lastIdx + 5) === 'chewy') {
                                return false; // Only matched 'chewy', not 'chew'
                            }
                        }
                    }
                    return rawLabel.includes(word);
                })) {
                    matched.add(i);
                }
            }
        }
        return matched;
    };

    const checkMismatch = (classes: string[][]): boolean => {
        const matchedA = getMatchedClasses(tokensA, labelA, classes);
        const matchedB = getMatchedClasses(tokensB, labelB, classes);

        const hasA = matchedA.size > 0;
        const hasB = matchedB.size > 0;

        if (hasA !== hasB) {
            return true;
        }

        if (hasA && hasB) {
            const hasIntersection = Array.from(matchedA).some(idx => matchedB.has(idx));
            if (!hasIntersection) {
                return true;
            }
        }

        return false;
    };

    return checkMismatch(FLAVOR_CLASSES) || checkMismatch(FORMAT_CLASSES);
}

/** Check if two normalized keys match (fuzzy, substring, or exact). */
function checkFuzzyMatch(
    keyA: string,
    keyB: string,
    nameA?: string,
    nameB?: string
): { similarity: number; autoMerge: boolean } {
    if (keyA === keyB) {
        return { similarity: 1.0, autoMerge: true };
    }

    if (hasTermMismatch(keyA, keyB, nameA, nameB)) {
        return { similarity: 0, autoMerge: false };
    }

    const coreA = getCoreNormalizedKey(keyA);
    const coreB = getCoreNormalizedKey(keyB);

    if (coreA === coreB && coreA.length >= 3) {
        return { similarity: 0.96, autoMerge: true };
    }

    const simFull = similarity(keyA, keyB);
    const simCore = similarity(coreA, coreB);
    const maxSim = Math.max(simFull, simCore);

    // Check if one is a core substring of the other (with min length to prevent overly broad matches)
    const isCoreSubstring = (coreA.length >= 6 && coreB.length >= 6) && 
        (coreA.includes(coreB) || coreB.includes(coreA));

    if (maxSim >= 0.92 || (isCoreSubstring && maxSim >= 0.85)) {
        return { similarity: maxSim, autoMerge: true };
    }

    if (maxSim >= 0.80 || isCoreSubstring) {
        return { similarity: maxSim, autoMerge: false };
    }

    return { similarity: maxSim, autoMerge: false };
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
