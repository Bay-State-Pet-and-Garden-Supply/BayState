/**
 * Duplicate Detector and Disambiguator for Product Consolidation
 *
 * When multiple UPCs in a batch produce identical consolidated names,
 * this module attempts to resolve the collision by searching for
 * differentiating variant fields across several data layers:
 *
 *   1. `sources`      – raw scraped data (top-level fields, core, facets)
 *   2. `consolidated` – prior consolidation output (core, facets)
 *   3. `input`        – POS feed data (parsed from abbreviated name)
 */

import { normalizeProductSources } from '@/lib/product-sources';
import { extractSizeFromInputName } from '@/lib/product-variant-parsing';

export { extractSizeFromInputName } from '@/lib/product-variant-parsing';

// Fields checked in priority order: size/weight first (most common variant
// axis), then qualitative differentiators. The detector stops at the first
// field where ALL UPCs have a value AND the values actually differ.
const DISAMBIGUATOR_FIELDS = [
    'size',
    'weight',
    'package_weight',
    'package-weight',
    'count',
    'pack',
    'flavor',
    'color',
    'scent',
    'material',
    'variant',
    'style',
    'pattern',
];


/**
 * Searches product sources for a specific field (e.g., flavor, color).
 * Traverses top-level fields, extracted.core, and facets (by definition_slug).
 */
function findFieldInSources(sources: Record<string, unknown>, field: string): string | null {
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
 * Searches a consolidated record for a specific field.
 * Checks core fields and facets (by definition_slug).
 */
function findFieldInConsolidated(consolidated: Record<string, unknown>, field: string): string | null {
    if (!consolidated || typeof consolidated !== 'object') {
        return null;
    }

    // Check top-level consolidated fields
    const topLevel = consolidated[field];
    if (typeof topLevel === 'string' && topLevel.trim().length > 0) {
        return topLevel.trim();
    }

    // Check core
    const core = consolidated.core;
    if (core && typeof core === 'object') {
        const coreVal = (core as Record<string, unknown>)[field];
        if (coreVal !== undefined && coreVal !== null) {
            const strVal = String(coreVal).trim();
            if (strVal.length > 0) {
                return strVal;
            }
        }
    }

    // Check facets
    const facets = consolidated.facets;
    if (Array.isArray(facets)) {
        for (const facet of facets) {
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

    return null;
}


/**
 * Inserts a differentiator string into a product name before size/dimensions.
 */
function insertDifferentiator(name: string, differentiator: string): string {
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

export interface DisambiguationRecord {
    sources: Record<string, unknown>;
    consolidated?: Record<string, unknown>;
    input?: Record<string, unknown>;
    [key: string]: any;
}

/**
 * Attempts to disambiguate identical consolidated product names using product
 * variant fields found across multiple data layers.
 *
 * Search order per field:
 *   1. Raw scraped `sources` (top-level, core, facets)
 *   2. Prior `consolidated` output (core, facets)
 *   3. POS `input.name` (parsed size/weight abbreviations) — for size fields only
 */
export function tryDisambiguateDuplicateNames(
    group: DisambiguationRow[],
    existingByUpc: Map<string, DisambiguationRecord>
): Map<string, string> | null {
    for (const field of DISAMBIGUATOR_FIELDS) {
        const values = new Map<string, string>();

        for (const row of group) {
            const record = existingByUpc.get(row.upc);
            if (!record) continue;

            // Layer 1: search raw sources
            let value = findFieldInSources(record.sources, field);

            // Layer 2: search consolidated record
            if (!value && record.consolidated) {
                value = findFieldInConsolidated(record.consolidated, field);
            }

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

    // Layer 3 fallback: parse size from POS input name
    const inputSizes = new Map<string, string>();
    for (const row of group) {
        const record = existingByUpc.get(row.upc);
        if (!record?.input) continue;
        const inputName = (record.input as Record<string, unknown>).name;
        const parsed = extractSizeFromInputName(typeof inputName === 'string' ? inputName : undefined);
        if (parsed) {
            inputSizes.set(row.upc, parsed);
        }
    }

    if (inputSizes.size === group.length && new Set(inputSizes.values()).size > 1) {
        const result = new Map<string, string>();
        for (const row of group) {
            const currentName = (typeof row.next_fields.name === 'string'
                ? row.next_fields.name
                : (row.next_fields.core as any)?.name || '') as string;
            const differentiator = inputSizes.get(row.upc)!;
            result.set(row.upc, insertDifferentiator(currentName, differentiator));
        }
        return result;
    }

    return null;
}
