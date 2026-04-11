/**
 * Result Normalizer
 *
 * Functions for normalizing product names, units, and other data
 * from LLM consolidation results.
 * Ported from BayStateTools.
 */

import { parseShopSitePages, SHOPSITE_PAGES } from '@/lib/shopsite/constants';

/**
 * Common abbreviations found in distributor product names.
 */
const ABBREVIATION_MAP: Record<string, string> = {
    'sm': 'Small', 'sml': 'Small', 'med': 'Medium', 'md': 'Medium',
    'lg': 'Large', 'lrg': 'Large', 'xl': 'XL', 'xxl': 'XXL',
    'blk': 'Black', 'blck': 'Black', 'wht': 'White', 'brn': 'Brown',
    'grn': 'Green', 'rd': 'Red', 'bl': 'Blue', 'yl': 'Yellow',
    'org': 'Orange', 'pnk': 'Pink', 'prpl': 'Purple', 'gry': 'Gray',
    'asst': 'Assorted', 'asstd': 'Assorted', 'chkn': 'Chicken',
    'slmn': 'Salmon', 'trky': 'Turkey', 'bf': 'Beef', 'lmb': 'Lamb',
    'wld': 'Wild', 'nat': 'Natural', 'orig': 'Original', 'reg': 'Regular',
    'unscnt': 'Unscented', 'flvr': 'Flavor',
};

/**
 * Expand common distributor abbreviations in product names.
 */
function expandAbbreviations(text: string): string {
    return text.split(' ').map((word) => {
        const stripped = word.replace(/[^a-zA-Z]/g, '');
        const replacement = ABBREVIATION_MAP[stripped.toLowerCase()];
        if (replacement) {
            return word.replace(stripped, replacement);
        }
        return word;
    }).join(' ');
}
function toTitleCasePreserveBrand(text: string): string {
    return text
        .split(' ')
        .map((word) => {
            if (!word) return word;
            const alpha = word.replace(/[^a-zA-Z]/g, '');
            const isAllCaps = alpha.length > 1 && alpha === alpha.toUpperCase();
            if (isAllCaps) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

/**
 * Normalize unit names to canonical forms with trailing periods.
 */
function normalizeUnits(text: string): string {
    const replacements: [RegExp, string][] = [
        [/\b(lbs?|pounds?)\b\.?/gi, 'lb.'],
        [/\b(ounces?|oz)\b\.?/gi, 'oz.'],
        [/\b(count|ct)\b\.?/gi, 'ct.'],
        [/\b(feet|ft)\b\.?/gi, 'ft.'],
        [/\b(inches?)\b/gi, 'in.'],
        [/(?<=\d\s*)in\b\.?/gi, 'in.'],
        [/"/g, ' in. '],
        [/\b(gallons?|gal)\b\.?/gi, 'gal.'],
        [/\b(quarts?|qt)\b\.?/gi, 'qt.'],
        [/\b(pints?|pt)\b\.?/gi, 'pt.'],
        [/\b(packs?|pk)\b\.?/gi, 'pk.'],
        [/\b(liters?)\b|\bL\.?/g, 'L'],
    ];
    let output = text;
    for (const [pattern, replacement] of replacements) {
        output = output.replace(pattern, replacement);
    }
    return output;
}

/**
 * Normalize dimension separators (X between numbers).
 */
function normalizeDimensions(text: string): string {
    // Normalize dimensions only when X is between numbers
    let output = text.replace(/(?<=\d)\s*[xX]\s*(?=\d)/g, ' X ');
    // Normalize multiple spaces
    output = output.replace(/\s{2,}/g, ' ');
    return output;
}

/**
 * Ensure proper spacing around inches in dimension strings.
 */
function ensureInchesSpacing(text: string): string {
    // If pattern like "2 in X4 in" -> "2 X 4 in"
    return text.replace(/(\d+)\s*in\s*X\s*(\d+)\s*in/gi, '$1 X $2 in');
}

/**
 * Normalize decimal values (trim trailing zeros, max 2 decimal places).
 */
function normalizeDecimals(text: string): string {
    return text.replace(/(\d+\.\d+|\d+)(?=\s?(lb\.|oz\.|ct\.|in\.|ft\.|gal\.|qt\.|pt\.|pk\.|L)\b)/gi, (match) => {
        const num = Number(match);
        if (Number.isNaN(num)) return match;
        const fixed = num.toFixed(2);
        const trimmed = fixed.replace(/\.0+$/, '').replace(/\.([0-9]*[1-9])0+$/, '.$1');
        return trimmed;
    });
}

/**
 * Ensure unit abbreviations have trailing periods.
 */
function ensureUnitPeriods(text: string): string {
    return text.replace(/\b(lb|oz|ct|ft|gal|qt|pt|pk)(?!\.)\b/gi, '$1.');
}

/**
 * Normalize unit casing to lowercase (except L for liters).
 */
function normalizeUnitCasing(text: string): string {
    return text
        .replace(/\b(lb|lb)\b\.?/gi, 'lb.')
        .replace(/\b(oz|oz)\b\.?/gi, 'oz.')
        .replace(/\b(ct|ct)\b\.?/gi, 'ct.')
        .replace(/\b(ft|ft)\b\.?/gi, 'ft.')
        .replace(/(?<=\d\s*)(in|in)\b\.?/gi, 'in.')
        .replace(/\b(in|in)\b\./gi, 'in.')
        .replace(/\b(gal|gal)\b\.?/gi, 'gal.')
        .replace(/\b(qt|qt)\b\.?/gi, 'qt.')
        .replace(/\b(pt|pt)\b\.?/gi, 'pt.')
        .replace(/\b(pk|pk)\b\.?/gi, 'pk.')
        .replace(/\b(l)\b/gi, 'L');
}

/**
 * Normalize spacing around special characters.
 */
function normalizeSpacing(text: string): string {
    return text
        .replace(/\s+/g, ' ')
        .replace(/\s+([X&])/g, ' $1')
        .replace(/([X&])\s+/g, '$1 ')
        .trim();
}

function normalizePlainText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function normalizeSearchKeywords(value: string): string {
    const segments = value
        .split(/[\n,;|]+/)
        .map((segment) => normalizePlainText(segment))
        .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
        return normalizePlainText(value);
    }

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const segment of segments) {
        const key = segment.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(segment);
    }

    return deduped.join(', ');
}

/**
 * Applies all unit-related normalization rules to a string.
 */
function normalizeStringUnits(text: string): string {
    let result = text;
    result = normalizeUnits(result);
    result = normalizeDecimals(result);
    result = ensureUnitPeriods(result);
    result = normalizeUnitCasing(result);
    result = ensureInchesSpacing(result);
    result = normalizeSpacing(result);
    return result;
}

/**
 * Normalize a consolidation result from the LLM.
 * Applies all normalization rules to the name field.
 */
export function normalizeConsolidationResult(
    data: Record<string, unknown>,
    validPages: readonly string[] = SHOPSITE_PAGES
): Record<string, unknown> {
    const normalized = { ...data };

    if (typeof normalized.name === 'string') {
        let name = normalized.name;
        name = expandAbbreviations(name);
        name = normalizeDimensions(name);
        name = normalizeStringUnits(name);
        name = toTitleCasePreserveBrand(name);
        // Re-assert canonical units after title case
        name = normalizeStringUnits(name);
        normalized.name = name;
    }

    if (typeof normalized.brand === 'string') {
        normalized.brand = normalizePlainText(normalized.brand.replace(/^brand\s*:\s*/i, ''));
    }

    if (typeof normalized.description === 'string') {
        normalized.description = normalizeStringUnits(normalizePlainText(normalized.description));
    }

    if (typeof normalized.long_description === 'string') {
        normalized.long_description = normalizeStringUnits(normalizePlainText(normalized.long_description));
    }

    if (typeof normalized.search_keywords === 'string') {
        normalized.search_keywords = normalizeSearchKeywords(normalized.search_keywords);
    }

    // Normalize weight field - convert to pounds
    if (typeof normalized.weight === 'string') {
        const normalizedWeight = normalizePlainText(normalized.weight);
        normalized.weight = normalizedWeight;
        const converted = convertWeightToPounds(normalizedWeight);
        if (converted !== null) {
            normalized.weight = converted;
        }
    }

    // Validate product_on_pages against valid ShopSite pages
    if ('product_on_pages' in normalized) {
        const allowedPages = new Set(validPages);
        const normalizedPages = parseShopSitePages(normalized.product_on_pages);
        normalized.product_on_pages =
            allowedPages.size > 0
                ? normalizedPages.filter((page) => allowedPages.has(page))
                : normalizedPages;
    }

    return normalized;
}

/**
 * Parse JSON response from LLM, handling various formats.
 */
export function parseJsonResponse(text: string): Record<string, unknown> | null {
    // Try direct parse
    try {
        return JSON.parse(text);
    } catch {
        // Continue to next method
    }

    // Try markdown code block
    const patterns = [/```json\s*([\s\S]*?)\s*```/, /```\s*([\s\S]*?)\s*```/];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            try {
                return JSON.parse(match[1]);
            } catch {
                continue;
            }
        }
    }

    // Try extracting JSON object
    try {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}') + 1;
        if (start >= 0 && end > start) {
            return JSON.parse(text.slice(start, end));
        }
    } catch {
        // Failed
    }

    return null;
}

/**
 * Convert weight string to pounds.
 * Supports: oz (ounces), lb (pounds), g (grams)
 * Handles compound units like "1 lb 8 oz"
 * Returns null for invalid/empty inputs.
 */
export function convertWeightToPounds(weight: string): string | null {
    // Handle null, undefined, empty, or N/A
    if (!weight || weight.trim() === '' || weight.trim().toUpperCase() === 'N/A') {
        return null;
    }

    const trimmed = weight.trim();
    
    // Conversion factors
    const OZ_PER_LB = 16;
    const G_PER_LB = 453.592;

    let totalPounds = 0;

    // Try to match pounds and ounces pattern: "1 lb 8 oz" or "1lb 8oz"
    const lbOzMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*lb\s+(?:and\s+)?(\d+(?:\.\d+)?)\s*oz$/i);
    if (lbOzMatch) {
        const lbs = parseFloat(lbOzMatch[1]);
        const oz = parseFloat(lbOzMatch[2]);
        totalPounds = lbs + (oz / OZ_PER_LB);
        return totalPounds.toFixed(2);
    }

    // Try to match ounces only: "16 oz" or "16oz"
    const ozMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*oz$/i);
    if (ozMatch) {
        const oz = parseFloat(ozMatch[1]);
        totalPounds = oz / OZ_PER_LB;
        return totalPounds.toFixed(2);
    }

    // Try to match pounds only: "5 lb" or "5lb"
    const lbMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*lb$/i);
    if (lbMatch) {
        const lbs = parseFloat(lbMatch[1]);
        totalPounds = lbs;
        return totalPounds.toFixed(2);
    }

    // Try to match grams: "500 g" or "500g"
    const gMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*g$/i);
    if (gMatch) {
        const g = parseFloat(gMatch[1]);
        totalPounds = g / G_PER_LB;
        return totalPounds.toFixed(2);
    }

    // If none of the patterns match, return null
    return null;
}
