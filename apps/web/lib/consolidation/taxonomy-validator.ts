/**
 * Taxonomy Validator
 *
 * Utilities for validating and normalizing category values
 * against the predefined taxonomy stored in Supabase.
 * Ported from BayStateTools.
 */

import { normalizeTaxonomyBreadcrumb } from '@/lib/taxonomy';

/**
 * Calculate Levenshtein distance between two strings (case-insensitive).
 */
function levenshteinDistance(a: string, b: string): number {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    if (aLower === bLower) return 0;
    if (aLower.length === 0) return bLower.length;
    if (bLower.length === 0) return aLower.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= bLower.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= aLower.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= bLower.length; i++) {
        for (let j = 1; j <= aLower.length; j++) {
            const cost = bLower.charAt(i - 1) === aLower.charAt(j - 1) ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1, // deletion
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[bLower.length][aLower.length];
}

/**
 * Find the closest match from a list of valid options using fuzzy matching.
 * Uses Levenshtein distance with a fallback to substring matching.
 *
 * @param value - The value to match
 * @param validOptions - Array of valid options to match against
 * @returns The closest matching option, or the first option if no good match
 */
export function findClosestMatch(value: string, validOptions: string[]): string {
    const normalizedValidOptions = validOptions.filter(
        (option): option is string => typeof option === 'string' && option.trim().length > 0
    );

    if (!value || normalizedValidOptions.length === 0) {
        return normalizedValidOptions[0] || '';
    }

    const normalizedValue = normalizeTaxonomyBreadcrumb(value);
    const valueLower = normalizedValue.toLowerCase().trim();
    const normalizedOptions = normalizedValidOptions.map((option) => ({
        raw: option,
        normalized: normalizeTaxonomyBreadcrumb(option),
        normalizedLower: normalizeTaxonomyBreadcrumb(option).toLowerCase(),
    }));

    // 1. Exact match (case-insensitive)
    const exactMatch = normalizedOptions.find((option) => option.normalizedLower === valueLower);
    if (exactMatch) return exactMatch.raw;

    // 2. Substring containment - if value contains or is contained by an option
    const substringMatch = normalizedOptions.find((option) => {
        return option.normalizedLower.includes(valueLower) || valueLower.includes(option.normalizedLower);
    });
    if (substringMatch) return substringMatch.raw;

    // 3. Word overlap - count common words
    const valueWords = new Set(valueLower.split(/\s+/).filter((w) => w.length > 2));
    let bestWordOverlap = { option: '', score: 0 };

    for (const option of normalizedOptions) {
        const optWords = new Set(option.normalizedLower.split(/\s+/).filter((w) => w.length > 2));
        let overlap = 0;
        for (const word of valueWords) {
            if (optWords.has(word)) overlap++;
        }
        if (overlap > bestWordOverlap.score) {
            bestWordOverlap = { option: option.raw, score: overlap };
        }
    }

    if (bestWordOverlap.score > 0) {
        return bestWordOverlap.option;
    }

    // 4. Levenshtein distance - find minimum edit distance
    let bestMatch = normalizedValidOptions[0];
    let bestDistance = Infinity;

    for (const option of normalizedOptions) {
        const distance = levenshteinDistance(normalizedValue, option.normalized);
        // Normalize by max length for fair comparison
        const normalizedDistance = distance / Math.max(normalizedValue.length, option.normalized.length);

        if (normalizedDistance < bestDistance) {
            bestDistance = normalizedDistance;
            bestMatch = option.raw;
        }
    }

    // Only accept if the normalized distance is reasonable (<0.6 = 60% different)
    if (bestDistance < 0.6) {
        return bestMatch;
    }

    // 5. Fallback to first option (or "Other" if available)
    const otherOption = normalizedValidOptions.find((opt) => opt.toLowerCase() === 'other');
    return otherOption || normalizedValidOptions[0];
}

/**
 * Validate and normalize a category value against valid categories.
 * Returns the exact valid category or the closest match.
 */
export function validateCategory(value: string | undefined | null, validCategories: string[]): string {
    if (!value || typeof value !== 'string') {
        return validCategories[0] || '';
    }
    return findClosestMatch(value, validCategories);
}

const REQUIRED_STRING_FIELDS = [
    'name',
    'brand',
] as const;

export function validateRequiredConsolidationFields(result: Record<string, unknown>): Record<string, unknown> {
    const validated = { ...result };

    for (const field of REQUIRED_STRING_FIELDS) {
        const rawValue = validated[field];
        if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
            throw new Error(`Invalid consolidation output: ${field} is required`);
        }

        validated[field] = rawValue.trim();
    }

    const confidenceScore = validated.confidence_score;
    if (
        typeof confidenceScore !== 'number'
        || !Number.isFinite(confidenceScore)
        || confidenceScore < 0
        || confidenceScore > 1
    ) {
        throw new Error('Invalid consolidation output: confidence_score must be between 0 and 1');
    }

    if (typeof validated.weight === 'string') {
        validated.weight = validated.weight.trim();
    }

    return validated;
}

/**
 * Build a provider-neutral JSON schema with enum constraints.
 * This can be wrapped for OpenAI Structured Outputs or passed directly to Gemini.
 */
export function buildResponseSchema(
    categories: string[],
    shopsitePages: string[] = []
): object {
    return {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Formatted product name following naming conventions',
            },
            brand: {
                type: 'string',
                description: 'Brand name',
            },
            weight: {
                type: ['string', 'null'],
                description: 'Primary package size/weight/count as a numeric string with up to 2 decimal places and no units. Use null when no trustworthy weight is available.',
            },
            product_on_pages: {
                type: 'array',
                items: {
                    type: 'string',
                    ...(shopsitePages.length > 0 ? { enum: shopsitePages } : {}),
                },
                description: 'Store pages this product should appear on, using exact page names from the provided list',
            },
            confidence_score: {
                type: 'number',
                description: 'Confidence score between 0.0 and 1.0',
            },
        },
        required: ['name', 'brand', 'weight', 'product_on_pages', 'confidence_score'],
        additionalProperties: false,
    };
}

export function buildOpenAIResponseFormat(schema: object): object {
    return {
        type: 'json_schema',
        json_schema: {
            name: 'product_consolidation',
            strict: true,
            schema,
        },
    };
}

/**
 * Validate and normalize a full consolidation result.
 * Ensures category is a valid taxonomy value.

 */
export function validateConsolidationTaxonomy(
    result: Record<string, unknown>,
    validCategories: string[]
): Record<string, unknown> {
    const validated = { ...result };

    if ('category' in validated && validated.category) {
        if (Array.isArray(validated.category)) {
            const uniqueValues = new Set<string>();
            const normalizedValues = (validated.category as unknown[])
                .map((value) => typeof value === 'string' ? validateCategory(value, validCategories) : '')
                .filter((value) => {
                    if (!value) return false;
                    if (uniqueValues.has(value)) return false;
                    uniqueValues.add(value);
                    return true;
                });
            validated.category = normalizedValues.join('|');
        } else if (typeof validated.category === 'string') {
            validated.category = validateCategory(validated.category, validCategories);
        }
    }

    return validated;
}
