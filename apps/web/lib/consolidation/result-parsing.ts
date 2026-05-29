/**
 * Parsing utilities for consolidation results.
 */

import { z } from 'zod';
import type { ConsolidationResult } from './types';
import { normalizeConsolidationResult } from './result-normalizer';
import { parseTaxonomyValues } from '@/lib/taxonomy';
import {
    validateCategory,
    validateConsolidationTaxonomy,
} from './taxonomy-validator';

// Define the Zod schema representing the raw LLM output schema contract
export const RawConsolidationSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    brand: z.string().min(1, 'Brand is required'),
    weight: z.string().nullable().optional(),
    confidence_score: z.number().min(0).max(1, 'Confidence score must be between 0.0 and 1.0'),
    category: z.string().min(1, 'Category is required'),
    description: z.string().min(1, 'Description is required'),
    search_keywords: z.string().min(1, 'Search keywords are required'),
    packaging_facets: z.record(z.string(), z.string()).optional(),
    price: z.union([z.string(), z.number()]).nullable().optional(),
});

function parseJsonResponse(content: string): Record<string, unknown> | null {
    try {
        // Strip common AI prefixes/suffixes like markdown blocks
        const cleaned = content.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

/**
 * Parses the structured text output from a consolidation run.
 * Handles category validation and field mapping.
 */
export function parseStructuredConsolidationText(
    upc: string,
    content: string,
    categories: string[]
): ConsolidationResult {
    const parsed = parseJsonResponse(content);

    if (!parsed) {
        return { upc, error: 'Failed to parse JSON response' };
    }

    try {
        const normalized = normalizeConsolidationResult(parsed);

        // Zod validation at parsing boundary
        const validationResult = RawConsolidationSchema.safeParse(normalized);
        if (!validationResult.success) {
            const errorMsg = validationResult.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join('; ');
            return { upc, error: `Validation failed: ${errorMsg}` };
        }

        const validated = validateConsolidationTaxonomy(validationResult.data, categories);

        const categoryValues = parseTaxonomyValues(
            typeof validated.category === 'string' ? validated.category : undefined
        );

        const normalizedCategory = categoryValues
            .map((value) => validateCategory(value, categories))
            .filter((value, index, array) => array.indexOf(value) === index);

        const result: ConsolidationResult = {
            upc,
            ...validated,
        } as ConsolidationResult;

        if (normalizedCategory.length > 0) {
            result.category = normalizedCategory.join('|');
        }

        return result;
    } catch (err) {
        return {
            upc,
            error: err instanceof Error ? err.message : 'Unknown validation error',
        };
    }
}

/**
 * Parse a single line from a batch output file (OpenAI format or direct chat).
 * Each line is either a successful result or an error.
 */
function parseBatchResultLine(
    upc: string,
    content: string,
    categories: string[]
): ConsolidationResult {
    return parseStructuredConsolidationText(upc, content, categories);
}

