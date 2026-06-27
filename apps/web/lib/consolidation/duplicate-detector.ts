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

// Fields checked in priority order. Prefer qualitative variant axes before
// size/weight because LLM output usually already includes net size when it is
// known. Size and weight are still useful fallbacks for true size variants, but
// using them first can insert noisy prior/source values such as "7 OZ (198 G)"
// instead of the real flavor/color differentiator.
const DISAMBIGUATOR_FIELDS = [
    'flavor',
    'color',
    'scent',
    'material',
    'variant',
    'style',
    'pattern',
    'size',
    'count',
    'pack',
    'weight',
    'package_weight',
    'package-weight',
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
function normalizeFieldKey(field: string): string {
    return field.toLowerCase().replace(/_/g, '-');
}

function getRecordStringField(record: Record<string, unknown>, field: string): string | null {
    const normalizedTarget = normalizeFieldKey(field);
    for (const [key, value] of Object.entries(record)) {
        if (normalizeFieldKey(key) !== normalizedTarget) {
            continue;
        }
        if (value !== undefined && value !== null) {
            const strVal = String(value).trim();
            if (strVal.length > 0) {
                return strVal;
            }
        }
    }
    return null;
}

function findFacetValue(facets: unknown, field: string): string | null {
    if (!Array.isArray(facets)) {
        return null;
    }

    const normalizedTarget = normalizeFieldKey(field);
    for (const facet of facets) {
        if (!facet || typeof facet !== 'object') {
            continue;
        }
        const facetRecord = facet as Record<string, unknown>;
        const slug = facetRecord.definition_slug;
        if (typeof slug !== 'string' || normalizeFieldKey(slug) !== normalizedTarget) {
            continue;
        }
        if (facetRecord.value !== undefined && facetRecord.value !== null) {
            const strVal = String(facetRecord.value).trim();
            if (strVal.length > 0) {
                return strVal;
            }
        }
    }

    return null;
}

function findFieldInConsolidated(consolidated: Record<string, unknown>, field: string): string | null {
    if (!consolidated || typeof consolidated !== 'object') {
        return null;
    }

    // Check top-level consolidated fields
    const topLevel = getRecordStringField(consolidated, field);
    if (topLevel) {
        return topLevel;
    }

    // Check core
    const core = consolidated.core;
    if (core && typeof core === 'object') {
        const coreVal = getRecordStringField(core as Record<string, unknown>, field);
        if (coreVal) {
            return coreVal;
        }
    }

    // Check facets
    return findFacetValue(consolidated.facets, field);
}

function findFieldInNextFields(nextFields: Record<string, unknown>, field: string): string | null {
    const topLevel = getRecordStringField(nextFields, field);
    if (topLevel) {
        return topLevel;
    }

    const core = nextFields.core;
    if (core && typeof core === 'object') {
        const coreVal = getRecordStringField(core as Record<string, unknown>, field);
        if (coreVal) {
            return coreVal;
        }
    }

    const facetValue = findFacetValue(nextFields.facets, field);
    if (facetValue) {
        return facetValue;
    }

    const packagingFacets = nextFields.packaging_facets;
    if (packagingFacets && typeof packagingFacets === 'object' && !Array.isArray(packagingFacets)) {
        return getRecordStringField(packagingFacets as Record<string, unknown>, field);
    }

    return null;
}

function normalizeDifferentiatorUnits(value: string): string {
    return value
        .replace(/\b(ounces?|oz)\b\.?/gi, 'oz.')
        .replace(/\b(lbs?|pounds?)\b\.?/gi, 'lb.')
        .replace(/\b(count|ct)\b\.?/gi, 'ct.')
        .replace(/\b(feet|ft)\b\.?/gi, 'ft.')
        .replace(/\b(inches?|in)\b\.?/gi, 'in.')
        .replace(/\b(gallons?|gal)\b\.?/gi, 'gal.')
        .replace(/\b(quarts?|qt)\b\.?/gi, 'qt.')
        .replace(/\b(pints?|pt)\b\.?/gi, 'pt.')
        .replace(/\b(packs?|pk)\b\.?/gi, 'pk.')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeContainsText(value: string): string {
    return normalizeDifferentiatorUnits(value)
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function sanitizeDifferentiatorValue(value: string, currentName: string): string | null {
    let cleaned = value
        .replace(/^weight\s*:\s*/i, '')
        .replace(/\(\s*\d+(?:\.\d+)?\s*g\.?\s*\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) {
        return null;
    }

    cleaned = normalizeDifferentiatorUnits(cleaned);

    if (!cleaned) {
        return null;
    }

    const normalizedName = normalizeContainsText(currentName);
    const normalizedValue = normalizeContainsText(cleaned);
    if (normalizedValue && normalizedName.includes(normalizedValue)) {
        return null;
    }

    return cleaned;
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

            const currentName = (typeof row.next_fields.name === 'string'
                ? row.next_fields.name
                : (row.next_fields.core as any)?.name || '') as string;

            // Layer 0: search current consolidation output first. This includes
            // current packaging_facets assembled into row.next_fields.facets and
            // avoids stale prior-consolidation artifacts during duplicate repair.
            let value = findFieldInNextFields(row.next_fields, field);

            // Layer 1: search raw sources
            if (!value) {
                value = findFieldInSources(record.sources, field);
            }

            // Layer 2: search prior consolidated record
            if (!value && record.consolidated) {
                value = findFieldInConsolidated(record.consolidated, field);
            }

            if (value) {
                const sanitized = sanitizeDifferentiatorValue(value, currentName);
                if (sanitized) {
                    values.set(row.upc, sanitized);
                }
            }
        }

        // All UPCs must have this field and values must actually differ after
        // sanitization; raw values can differ only by noisy unit/metric formatting.
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
            const differentiator = sanitizeDifferentiatorValue(inputSizes.get(row.upc)!, currentName);
            if (!differentiator) {
                return null;
            }
            result.set(row.upc, insertDifferentiator(currentName, differentiator));
        }
        return result;
    }

    return null;
}
