/**
 * Group Result Parsing
 *
 * Parses multi-product consolidation output and validates completeness.
 * Every UPC in the input MUST appear in the output — partial output is rejected.
 */

import { z } from 'zod';
import { normalizeConsolidationResult } from './result-normalizer';
import { validateConsolidationTaxonomy, validateCategory } from './taxonomy-validator';
import { parseTaxonomyValues } from '@/lib/taxonomy';
import type { ConsolidationResult } from './types';

/** Schema for a single product within the group output. Identical to RawConsolidationSchema. */
const GroupProductSchema = z.object({
    name: z.string().min(1),
    brand: z.string().optional(),
    weight: z.string().nullable().optional(),
    confidence_score: z.number().min(0).max(1),
    category: z.string().min(1),
    description: z.string().min(1),
    search_keywords: z.string().min(1),
    packaging_facets: z.record(z.string(), z.string()).optional(),
    price: z.union([z.string(), z.number()]).nullable().optional(),
});

/** Schema for the full group output: { products: { UPC: {...}, ... } }. */
const GroupOutputSchema = z.object({
    products: z.record(z.string(), GroupProductSchema),
});

export interface GroupParseResult {
    /** Per-UPC consolidation results, if parsing succeeded. */
    results: ConsolidationResult[];
    /** Error message if parsing or validation failed. */
    error?: string;
    /** UPCs present in the input but missing from the output (incomplete). */
    missingUpcs?: string[];
    /** UPCs present in the output but not in the input (extraneous). */
    extraUpcs?: string[];
}

/**
 * Parse a JSON string from a group consolidation LLM response.
 *
 * @param inputUpcs - The set of UPCs that were submitted in the group prompt
 * @param content - The raw LLM response text
 * @param categories - Allowed category taxonomy
 * @returns Flattened ConsolidationResult[] if successful, or error details
 */
export function parseGroupConsolidationText(
    inputUpcs: string[],
    content: string,
    categories: string[]
): GroupParseResult {
    const inputUpcSet = new Set(inputUpcs);

    // --- Parse JSON ---
    let parsed: Record<string, unknown> | null = null;

    try {
        parsed = JSON.parse(content);
    } catch {
        // Try markdown code block
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            try { parsed = JSON.parse(jsonMatch[1]); } catch { /* continue */ }
        }
        if (!parsed) {
            const start = content.indexOf('{');
            const end = content.lastIndexOf('}') + 1;
            if (start >= 0 && end > start) {
                try { parsed = JSON.parse(content.slice(start, end)); } catch { /* continue */ }
            }
        }
    }

    if (!parsed) {
        return { results: [], error: 'Failed to parse JSON from group response' };
    }

    // --- Schema validation ---
    const validationResult = GroupOutputSchema.safeParse(parsed);
    if (!validationResult.success) {
        return {
            results: [],
            error: `Group output schema validation failed: ${validationResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        };
    }

    const outputProducts = validationResult.data.products;
    const outputUpcs = new Set(Object.keys(outputProducts));

    // --- Completeness check: every input UPC must be present ---
    const missingUpcs = Array.from(inputUpcSet).filter(upc => !outputUpcs.has(upc));
    const extraUpcs = Array.from(outputUpcs).filter(upc => !inputUpcSet.has(upc));

    if (missingUpcs.length > 0) {
        return {
            results: [],
            error: `Group output is incomplete: ${missingUpcs.length} UPCs missing from response`,
            missingUpcs,
        };
    }

    // --- Per-UPC processing ---
    const results: ConsolidationResult[] = [];

    for (const [upc, rawProduct] of Object.entries(outputProducts)) {
        try {
            const normalized = normalizeConsolidationResult(rawProduct as Record<string, unknown>);
            const validated = validateConsolidationTaxonomy(
                normalized as any,
                categories
            );

            const categoryValues = parseTaxonomyValues(
                typeof validated.category === 'string' ? validated.category : undefined
            );
            const normalizedCategory = categoryValues
                .map(value => validateCategory(value, categories))
                .filter((value, idx, arr) => arr.indexOf(value) === idx);

            const result: ConsolidationResult = {
                upc,
                ...validated,
            } as ConsolidationResult;

            if (normalizedCategory.length > 0) {
                result.category = normalizedCategory.join('|');
            }

            results.push(result);
        } catch (err) {
            results.push({
                upc,
                error: err instanceof Error ? err.message : 'Per-product validation error',
            });
        }
    }

    // Include extra UPCs as warnings (they still get processed)
    if (extraUpcs.length > 0) {
        console.warn(`[GroupParser] Extra UPCs in output not in input: ${extraUpcs.join(', ')}`);
    }

    return { results, extraUpcs: extraUpcs.length > 0 ? extraUpcs : undefined };
}
