/**
 * Parsing utilities for consolidation results.
 */

import type { ConsolidationResult } from './types';
import { normalizeConsolidationResult } from './result-normalizer';
import { parseTaxonomyValues } from '@/lib/taxonomy';
import {
    validateCategory,
    validateConsolidationTaxonomy,
    validateRequiredConsolidationFields,
} from './taxonomy-validator';

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

    const normalized = normalizeConsolidationResult(parsed);
    const requiredFieldsValidated = validateRequiredConsolidationFields(normalized);
    const validated = validateConsolidationTaxonomy(requiredFieldsValidated, categories);

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
