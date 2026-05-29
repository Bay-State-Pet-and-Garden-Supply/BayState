/**
 * Duplicate Detector and Disambiguator for Product Consolidation
 */

import { normalizeProductSources } from '@/lib/product-sources';

const DISAMBIGUATOR_FIELDS = ['flavor', 'color', 'scent', 'material', 'variant', 'style', 'pattern'];

/**
 * Searches product sources for a specific field (e.g., flavor, color).
 */
export function findFieldInSources(sources: Record<string, unknown>, field: string): string | null {
    const normalizedSources = normalizeProductSources(sources);
    for (const sourcePayload of Object.values(normalizedSources)) {
        if (sourcePayload && typeof sourcePayload === 'object') {
            const value = (sourcePayload as Record<string, unknown>)[field];
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }

            const nested = (sourcePayload.extracted && typeof sourcePayload.extracted === 'object')
                ? (sourcePayload.extracted as any)
                : sourcePayload;

            if (nested && typeof nested === 'object') {
                if (nested.core && typeof nested.core === 'object') {
                    const coreVal = nested.core[field];
                    if (coreVal !== undefined && coreVal !== null) {
                        const strVal = String(coreVal).trim();
                        if (strVal.length > 0) {
                            return strVal;
                        }
                    }
                }

                if (Array.isArray(nested.facets)) {
                    for (const facet of nested.facets) {
                        if (facet && typeof facet === 'object' && facet.definition_slug === field) {
                            if (facet.value !== undefined && facet.value !== null) {
                                const strVal = String(facet.value).trim();
                                if (strVal.length > 0) {
                                    return strVal;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}

/**
 * Inserts a differentiator string into a product name before size/dimensions.
 */
export function insertDifferentiator(name: string, differentiator: string): string {
    const sizePatterns = [
        /\s+(\d+(?:\.\d+)?)\s*(?:lb|oz|ct|in|ft|gal|qt|pt|pk)\b\.?/i,
        /\s+X\s+\d+/,
    ];

    let insertIndex = name.length;
    for (const pattern of sizePatterns) {
        const match = name.match(pattern);
        if (match && match.index !== undefined && match.index < insertIndex) {
            insertIndex = match.index;
        }
    }

    const before = name.slice(0, insertIndex).trim();
    const after = name.slice(insertIndex).trim();
    return `${before} ${differentiator}${after.length > 0 ? ` ${after}` : ''}`;
}

export interface DisambiguationRow {
    upc: string;
    next_fields: Record<string, unknown>;
    name_key?: string;
}

/**
 * Attempts to disambiguate identical consolidated product names using product variant fields found in sources.
 */
export function tryDisambiguateDuplicateNames(
    group: DisambiguationRow[],
    existingByUpc: Map<
        string,
        {
            sources: Record<string, unknown>;
            [key: string]: any;
        }
    >
): Map<string, string> | null {
    for (const field of DISAMBIGUATOR_FIELDS) {
        const values = new Map<string, string>();

        for (const row of group) {
            const record = existingByUpc.get(row.upc);
            const value = record ? findFieldInSources(record.sources, field) : null;
            if (value) {
                values.set(row.upc, value);
            }
        }

        // All UPCs must have this field and values must actually differ
        if (values.size === group.length && new Set(values.values()).size > 1) {
            const result = new Map<string, string>();
            for (const row of group) {
                const currentName = (typeof row.next_fields.name === 'string'
                    ? row.next_fields.name
                    : (row.next_fields.core as any)?.name || '') as string;
                const differentiator = values.get(row.upc)!;
                result.set(row.upc, insertDifferentiator(currentName, differentiator));
            }
            return result;
        }
    }

    return null;
}
