/**
 * Taxonomy Validator
 *
 * Utilities for validating and normalizing category and product_type values
 * against the predefined taxonomy stored in Supabase.
 * Ported from BayStateTools.
 */

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
    if (!value || validOptions.length === 0) {
        return validOptions[0] || '';
    }

    const valueLower = value.toLowerCase().trim();

    // 1. Exact match (case-insensitive)
    const exactMatch = validOptions.find((opt) => opt.toLowerCase() === valueLower);
    if (exactMatch) return exactMatch;

    // 2. Substring containment - if value contains or is contained by an option
    const substringMatch = validOptions.find((opt) => {
        const optLower = opt.toLowerCase();
        return optLower.includes(valueLower) || valueLower.includes(optLower);
    });
    if (substringMatch) return substringMatch;

    // 3. Word overlap - count common words
    const valueWords = new Set(valueLower.split(/\s+/).filter((w) => w.length > 2));
    let bestWordOverlap = { option: '', score: 0 };

    for (const opt of validOptions) {
        const optWords = new Set(opt.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
        let overlap = 0;
        for (const word of valueWords) {
            if (optWords.has(word)) overlap++;
        }
        if (overlap > bestWordOverlap.score) {
            bestWordOverlap = { option: opt, score: overlap };
        }
    }

    if (bestWordOverlap.score > 0) {
        return bestWordOverlap.option;
    }

    // 4. Levenshtein distance - find minimum edit distance
    let bestMatch = validOptions[0];
    let bestDistance = Infinity;

    for (const opt of validOptions) {
        const distance = levenshteinDistance(value, opt);
        // Normalize by max length for fair comparison
        const normalizedDistance = distance / Math.max(value.length, opt.length);

        if (normalizedDistance < bestDistance) {
            bestDistance = normalizedDistance;
            bestMatch = opt;
        }
    }

    // Only accept if the normalized distance is reasonable (<0.6 = 60% different)
    if (bestDistance < 0.6) {
        return bestMatch;
    }

    // 5. Fallback to first option (or "Other" if available)
    const otherOption = validOptions.find((opt) => opt.toLowerCase() === 'other');
    return otherOption || validOptions[0];
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

/**
 * Validate and normalize a product type value against valid product types.
 * Returns the exact valid product type or the closest match.
 */
export function validateProductType(value: string | undefined | null, validTypes: string[]): string {
    if (!value || typeof value !== 'string') {
        return validTypes[0] || '';
    }
    return findClosestMatch(value, validTypes);
}

/**
 * Build a JSON schema for OpenAI Structured Outputs with enum constraints.
 * This enforces that the LLM can only return values from the provided taxonomy.
 */
export function buildResponseSchema(categories: string[], productTypes: string[]): object {
    return {
        type: 'json_schema',
        json_schema: {
            name: 'product_consolidation',
            strict: true,
            schema: {
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
                        type: 'string',
                        description: "Product weight as a string (e.g., '10.5')",
                    },
                    description: {
                        type: 'string',
                        description: 'Short product description (1-2 sentences) for category/listing pages',
                    },
                    long_description: {
                        type: 'string',
                        description: 'Detailed product description (3-5 sentences) for the product detail page',
                    },
                    search_keywords: {
                        type: 'string',
                        description: 'Comma-separated search keywords (5-15 terms, lowercase)',
                    },
                    product_on_pages: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        description: 'Store pages this product should appear on',
                    },
                    category: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: categories,
                        },
                        description: 'List of applicable product categories',
                    },
                    product_type: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: productTypes,
                        },
                        description: 'List of applicable product types',
                    },
                    confidence_score: {
                        type: 'number',
                        description: 'Confidence score between 0.0 and 1.0',
                    },
                },
                required: ['name', 'brand', 'weight', 'description', 'long_description', 'search_keywords', 'product_on_pages', 'category', 'product_type', 'confidence_score'],
                additionalProperties: false,
            },
        },
    };
}

/**
 * Validate and normalize a full consolidation result.
 * Ensures category and product_type are valid taxonomy values.
 */
export function validateConsolidationTaxonomy(
    result: Record<string, unknown>,
    validCategories: string[],
    validProductTypes: string[]
): Record<string, unknown> {
    const validated = { ...result };

    if ('category' in validated) {
        if (Array.isArray(validated.category)) {
            const uniqueValues = new Set<string>();
            const normalizedValues = validated.category
                .map((value) => validateCategory(value, validCategories))
                .filter((value) => {
                    if (!value) return false;
                    if (uniqueValues.has(value)) return false;
                    uniqueValues.add(value);
                    return true;
                });
            validated.category = normalizedValues.join('|');
        } else {
            validated.category = validateCategory(validated.category as string, validCategories);
        }
    }

    if ('product_type' in validated) {
        if (Array.isArray(validated.product_type)) {
            const uniqueValues = new Set<string>();
            const normalizedValues = validated.product_type
                .map((value) => validateProductType(value, validProductTypes))
                .filter((value) => {
                    if (!value) return false;
                    if (uniqueValues.has(value)) return false;
                    uniqueValues.add(value);
                    return true;
                });
            validated.product_type = normalizedValues.join('|');
        } else {
            validated.product_type = validateProductType(validated.product_type as string, validProductTypes);
        }
    }

    const categoryValue = typeof validated.category === 'string' ? validated.category : '';
    const productTypeValue = typeof validated.product_type === 'string' ? validated.product_type : '';

    if (!categoryValue.trim()) {
        throw new Error('Invalid consolidation taxonomy: category is required');
    }

    if (!productTypeValue.trim()) {
        throw new Error('Invalid consolidation taxonomy: product_type is required');
    }

    return validated;
}
