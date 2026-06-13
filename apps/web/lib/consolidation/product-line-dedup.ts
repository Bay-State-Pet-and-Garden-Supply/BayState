import { normalizeProductLineKey, upsertProductLine, type ProductLineRecord } from './product-lines';

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

const AUTO_MERGE_THRESHOLD = 0.95;
const AMBIGUOUS_THRESHOLD = 0.85;

/**
 * Run post-classification fuzzy dedup on a set of raw labels.
 * Returns canonical labels (upserted to product_lines) and any ambiguous UPCs.
 *
 * @param rawAssignments - Map of UPC to raw label string from classification
 * @param brandId - Optional brand ID to scope product lines
 */
export async function deduplicateProductLines(
    rawAssignments: Map<string, string>,
    brandId?: string | null
): Promise<DedupResult> {
    const canonicalLabels = new Map<string, ProductLineRecord>();
    const ambiguousUpcs = new Set<string>();

    const entries = Array.from(rawAssignments.entries());
    const normalizedKeys = new Map<string, string>();

    for (const [upc, rawLabel] of entries) {
        normalizedKeys.set(upc, normalizeProductLineKey(rawLabel));
    }

    // Group by normalized key
    const groups = new Map<string, string[]>();
    for (const [upc, key] of normalizedKeys) {
        const existing = groups.get(key) || [];
        existing.push(upc);
        groups.set(key, existing);
    }

    const distinctKeys = Array.from(groups.keys());

    // Auto-merge: for each pair of distinct keys, if similarity > 0.95, merge them
    const merged = new Map<string, string>(); // normalized_key -> canonical_key
    const processed = new Set<string>();

    for (const key of distinctKeys) {
        if (processed.has(key)) continue;

        let bestMatch: string | null = null;
        let bestSimilarity = 0;

        for (const other of distinctKeys) {
            if (other === key || processed.has(other)) continue;
            const sim = similarity(key, other);
            if (sim > AUTO_MERGE_THRESHOLD && sim > bestSimilarity) {
                bestSimilarity = sim;
                bestMatch = other;
            }
        }

        if (bestMatch) {
            // Merge: both keys use the longest label's key
            const canonical = key.length >= bestMatch.length ? key : bestMatch;
            merged.set(key, canonical);
            merged.set(bestMatch, canonical);
            processed.add(key);
            processed.add(bestMatch);
        } else {
            merged.set(key, key);
            processed.add(key);
        }
    }

    // Flag ambiguous: high similarity but not auto-merged (second pass after merges settled)
    const resolvedKeys = Array.from(new Set(merged.values()));

    for (let i = 0; i < resolvedKeys.length; i++) {
        for (let j = i + 1; j < resolvedKeys.length; j++) {
            const sim = similarity(resolvedKeys[i], resolvedKeys[j]);
            if (sim > AMBIGUOUS_THRESHOLD && sim <= AUTO_MERGE_THRESHOLD) {
                // Find all UPCs associated with either key
                for (const [upc, nk] of normalizedKeys) {
                    const assignedTo = merged.get(nk);
                    if (assignedTo === resolvedKeys[i] || assignedTo === resolvedKeys[j]) {
                        ambiguousUpcs.add(upc);
                    }
                }
            }
        }
    }

    // Upsert canonical product lines
    for (const [key, canonicalKey] of merged) {
        if (!canonicalLabels.has(canonicalKey)) {
            const upcs = groups.get(key) || [];
            const displayName = upcs.length > 0
                ? rawAssignments.get(upcs[0]) || key
                : key;
            const record = await upsertProductLine(displayName, brandId);
            canonicalLabels.set(canonicalKey, record);
        }
    }

    return { canonicalLabels, ambiguousUpcs };
}
