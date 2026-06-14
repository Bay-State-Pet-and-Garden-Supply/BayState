/**
 * Result Normalizer
 *
 * Functions for normalizing product names, units, and other data
 * from LLM consolidation results.
 * Ported from BayStateTools.
 */


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
 * Handles hyphenated and slash-separated forms (e.g., "Sm-Med", "Blk/Wht").
 */
function expandAbbreviations(text: string): string {
    // Expose abbreviations joined by hyphens or slashes
    const preprocessed = text.replace(/(?<=[a-zA-Z])[-\/](?=[a-zA-Z])/g, ' $& ');
    const expanded = preprocessed.split(/\s+/).map((word) => {
        if (word === '-' || word === '/') return word;
        const stripped = word.replace(/[^a-zA-Z]/g, '');
        const replacement = ABBREVIATION_MAP[stripped.toLowerCase()];
        if (replacement) {
            return word.replace(stripped, replacement);
        }
        return word;
    }).join(' ');
    // Tighten spaces around hyphens/slashes
    return expanded.replace(/\s+([-\/])\s+/g, '$1').replace(/\s+/g, ' ');
}

/**
 * Normalize common abbreviations in product names for consistency.
 * W/ → With, w/ → with, ensure space before units (18in. → 18 in.)
 */
function normalizeNameAbbreviations(text: string): string {
    let result = text;
    // W/ → With (case-sensitive: W/ at word boundary)
    result = result.replace(/\bW\//g, 'With');
    result = result.replace(/\bw\//g, 'with');
    // Ensure space before unit abbreviations when preceded by a digit
    // e.g. "18in." → "18 in.", "7oz." → "7 oz."
    result = result.replace(/(\d)(in|oz|lb|ct|ft|gal|qt|pt|pk)\b/gi, '$1 $2');
    return result;
}
function toTitleCasePreserveBrand(text: string, brand?: string): string {
    const PRESERVED_ALL_CAPS = new Set([
        'SPOT', 'JW', 'KONG', 'USA', 'XL', 'XXL', 'XXXL',
    ]);
    const brandLower = brand ? brand.toLowerCase() : '';
    const UNITS = new Set(['in.', 'oz.', 'lb.', 'ct.', 'ft.', 'gal.', 'qt.', 'pt.', 'pk.', 'in', 'oz', 'lb', 'ct', 'ft', 'gal', 'qt', 'pt', 'pk']);

    return text
        .split(' ')
        .map((word) => {
            if (!word) return word;

            const cleanWord = word.replace(/[^a-zA-Z]/g, '');
            const cleanWordLower = cleanWord.toLowerCase();
            const cleanWordUpper = cleanWord.toUpperCase();

            if (UNITS.has(cleanWordLower)) {
                return word.toLowerCase();
            }

            if (brandLower && cleanWordLower === brandLower) {
                if (PRESERVED_ALL_CAPS.has(cleanWordUpper)) {
                    return word.toUpperCase();
                }
                return brand;
            }

            if (PRESERVED_ALL_CAPS.has(cleanWordUpper)) {
                return word.toUpperCase();
            }

            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

/**
 * Normalize unit names to canonical forms with trailing periods.
 */
function normalizeUnits(text: string): string {
    const replacements: [RegExp, string][] = [
        [/(?<=\d\s*|\b)(lbs?|pounds?)\b\.?/gi, 'lb.'],
        [/(?<=\d\s*|\b)(ounces?|oz)\b\.?/gi, 'oz.'],
        [/(?<=\d\s*|\b)(count|ct)\b\.?/gi, 'ct.'],
        [/(?<=\d\s*|\b)(feet|ft)\b\.?/gi, 'ft.'],
        [/\b(inches?)\b/gi, 'in.'],
        [/(?<=\d\s*)in\b\.?/gi, 'in.'],
        [/"/g, ' in. '],
        [/(?<=\d\s*|\b)(gallons?|gal)\b\.?/gi, 'gal.'],
        [/(?<=\d\s*|\b)(quarts?|qt)\b\.?/gi, 'qt.'],
        [/(?<=\d\s*|\b)(pints?|pt)\b\.?/gi, 'pt.'],
        [/(?<=\d\s*|\b)(packs?|pk)\b\.?/gi, 'pk.'],
        [/(?<=\d\s*|\b)(liters?)\b|\bL\.?/g, 'L'],
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
        .replace(/(?<=\d\s*|\b)lb\b\.?/gi, 'lb.')
        .replace(/(?<=\d\s*|\b)oz\b\.?/gi, 'oz.')
        .replace(/(?<=\d\s*|\b)ct\b\.?/gi, 'ct.')
        .replace(/(?<=\d\s*|\b)ft\b\.?/gi, 'ft.')
        .replace(/(?<=\d\s*)in\b\.?/gi, 'in.')
        .replace(/(?<=\d\s*|\b)gal\b\.?/gi, 'gal.')
        .replace(/(?<=\d\s*|\b)qt\b\.?/gi, 'qt.')
        .replace(/(?<=\d\s*|\b)pt\b\.?/gi, 'pt.')
        .replace(/(?<=\d\s*|\b)pk\b\.?/gi, 'pk.')
        .replace(/(?<=\d\s*|\b)l\b/gi, 'L');
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

/**
 * Title-case a single keyword segment, preserving known ALL-CAPS tokens.
 */
function titleCaseKeyword(segment: string, brand?: string): string {
    const PRESERVED_ALL_CAPS = new Set([
        'SPOT', 'JW', 'KONG', 'USA', 'XL', 'XXL', 'XXXL',
    ]);
    const brandLower = brand ? brand.toLowerCase() : '';

    return segment
        .split(' ')
        .map((word) => {
            if (!word) return word;

            const cleanWord = word.replace(/[^a-zA-Z]/g, '');
            const cleanWordLower = cleanWord.toLowerCase();
            const cleanWordUpper = cleanWord.toUpperCase();

            if (brandLower && cleanWordLower === brandLower) {
                if (PRESERVED_ALL_CAPS.has(cleanWordUpper)) {
                    return word.toUpperCase();
                }
                return brand;
            }

            if (PRESERVED_ALL_CAPS.has(cleanWordUpper)) {
                return word.toUpperCase();
            }

            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

function normalizeSearchKeywords(value: string, brand?: string): string {
    const segments = value
        .split(/[\n,;|]+/)
        .map((segment) => normalizePlainText(segment))
        .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
        return normalizePlainText(value);
    }

    // Title-case each segment for consistency
    const titleCased = segments.map((seg) => titleCaseKeyword(seg, brand));

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const segment of titleCased) {
        const key = segment.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(segment);
    }

    // Ensure brand is the first keyword if provided and not already present
    if (brand) {
        const brandNormalized = normalizePlainText(brand);
        const brandLower = brandNormalized.toLowerCase();
        const existingBrandIdx = deduped.findIndex((kw) => kw.toLowerCase() === brandLower);
        if (existingBrandIdx > 0) {
            // Brand exists but not first — move it to front
            deduped.splice(existingBrandIdx, 1);
            deduped.unshift(brandNormalized);
        } else if (existingBrandIdx === -1) {
            // Brand missing entirely — prepend it
            deduped.unshift(brandNormalized);
        }
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
    data: Record<string, unknown>
): Record<string, unknown> {
    const normalized = { ...data };

    let brand: string | undefined;
    if (typeof normalized.brand === 'string') {
        brand = normalizePlainText(normalized.brand.replace(/^brand\s*:\s*/i, ''));
        normalized.brand = brand;
    }

    if (typeof normalized.name === 'string') {
        let name = normalized.name;
        name = normalizeNameAbbreviations(name);
        name = expandAbbreviations(name);
        name = normalizeDimensions(name);
        name = normalizeStringUnits(name);
        name = toTitleCasePreserveBrand(name, brand);
        // Re-assert canonical units after title case
        name = normalizeStringUnits(name);
        normalized.name = name;
    }

    // Enforce brand-at-start: if brand exists and name doesn't start with it, prepend
    if (brand && typeof normalized.name === 'string') {
        const brandLower = brand.toLowerCase();
        const nameLower = normalized.name.toLowerCase();
        if (!nameLower.startsWith(brandLower)) {
            normalized.name = `${brand} ${normalized.name}`;
        }
    }

    if (typeof normalized.description === 'string') {
        normalized.description = normalizeStringUnits(normalizePlainText(normalized.description));
    }

    if (typeof normalized.search_keywords === 'string' && normalized.search_keywords.trim()) {
        normalized.search_keywords = normalizeSearchKeywords(normalized.search_keywords, brand);
    } else {
        // Generate search_keywords from product name as fallback
        const nameStr = (typeof normalized.name === 'string' && normalized.name.trim()) 
            ? normalized.name.trim() 
            : '';
        if (nameStr) {
            // Extract meaningful keyword segments from the name
            const keywords = nameStr
                .split(/\s+/)
                .filter(word => word.length > 1 && !/^(the|a|an|in|of|and|for|with|is|to|by|on)$/i.test(word))
                .join(' ');
            normalized.search_keywords = keywords
                ? normalizeSearchKeywords(keywords, brand)
                : normalizeSearchKeywords(nameStr, brand);
        } else {
            // Last resort: brand-only if available
            normalized.search_keywords = brand ? normalizeSearchKeywords(brand, brand) : '';
        }
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

    return normalized;
}

/**
 * Parse JSON response from LLM, handling various formats.
 */
function parseJsonResponse(text: string): Record<string, unknown> | null {
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
    const lbOzMatch = trimmed.match(/\b(\d+(?:\.\d+)?)\s*lb\s+(?:and\s+)?(\d+(?:\.\d+)?)\s*oz\b/i);
    if (lbOzMatch) {
        const lbs = parseFloat(lbOzMatch[1]);
        const oz = parseFloat(lbOzMatch[2]);
        totalPounds = lbs + (oz / OZ_PER_LB);
        return totalPounds.toFixed(2);
    }

    // Try to match ounces only: "16 oz" or "16oz"
    const ozMatch = trimmed.match(/\b(\d+(?:\.\d+)?)\s*oz\b/i);
    if (ozMatch) {
        const oz = parseFloat(ozMatch[1]);
        totalPounds = oz / OZ_PER_LB;
        return totalPounds.toFixed(2);
    }

    // Try to match pounds only: "5 lb" or "5lb"
    const lbMatch = trimmed.match(/\b(\d+(?:\.\d+)?)\s*lb\b/i);
    if (lbMatch) {
        const lbs = parseFloat(lbMatch[1]);
        totalPounds = lbs;
        return totalPounds.toFixed(2);
    }

    // Try to match grams: "500 g" or "500g"
    const gMatch = trimmed.match(/\b(\d+(?:\.\d+)?)\s*g\b/i);
    if (gMatch) {
        const g = parseFloat(gMatch[1]);
        totalPounds = g / G_PER_LB;
        return totalPounds.toFixed(2);
    }

    // If none of the patterns match, return null
    return null;
}
