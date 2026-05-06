/**
 * Result Parsing
 *
 * Shared response parsing for both OpenAI Batch API and direct chat (LM Studio) responses.
 * Extracted from batch-service.ts to avoid duplication.
 */

import { normalizeConsolidationResult, parseJsonResponse } from './result-normalizer';
import { validateCategory, validateConsolidationTaxonomy, validateRequiredConsolidationFields } from './taxonomy-validator';
import { parseTaxonomyValues } from '@/lib/taxonomy';
import type { ConsolidationResult } from './types';

/**
 * Parse a single LLM response into a structured consolidation result.
 * Applies normalization, required field validation, taxonomy validation, and category matching.
 */
export function parseStructuredConsolidationText(
    sku: string,
    content: string,
    shopsitePages: string[],
    categories: string[]
): ConsolidationResult {
    const parsed = parseJsonResponse(content);

    if (!parsed) {
        return { sku, error: 'Failed to parse JSON response' };
    }

    const normalized = normalizeConsolidationResult(parsed, shopsitePages);
    const requiredFieldsValidated = validateRequiredConsolidationFields(normalized);
    const validated = validateConsolidationTaxonomy(requiredFieldsValidated, categories);

    const categoryValues = parseTaxonomyValues(
        typeof validated.category === 'string' ? validated.category : undefined
    );

    const normalizedCategory = categoryValues
        .map((value) => validateCategory(value, categories))
        .filter((value, index, array) => array.indexOf(value) === index);

    const productOnPages = Array.isArray(validated.product_on_pages)
        ? (validated.product_on_pages as string[]).join('|')
        : typeof validated.product_on_pages === 'string'
            ? validated.product_on_pages
            : undefined;

    return {
        sku,
        ...validated,
        ...(normalizedCategory.length > 0 ? { category: normalizedCategory.join('|') } : {}),
        ...(productOnPages ? { product_on_pages: productOnPages } : {}),
    } as ConsolidationResult;
}

/**
 * Parse a single line from a batch output file (OpenAI format or direct chat).
 * Each line is either a successful result or an error.
 */
export function parseBatchOutputLine(
    sku: string,
    content: string,
    shopsitePages: string[],
    categories: string[]
): ConsolidationResult {
    return parseStructuredConsolidationText(sku, content, shopsitePages, categories);
}
