/**
 * Product Line Classification
 *
 * AI-driven classification of products into manufacturer product lines.
 * Used during the Grouping pipeline stage to assign each product a
 * canonical Product Line Label before Group Consolidation.
 *
 * Classification uses minimal source evidence (name, brand, category)
 * and follows the configured consolidation provider setting.
 *
 * Threshold: 0.80 — products below this become Singletons (ungrouped).
 *
 * See: docs/adr/0004-group-based-consolidation.md
 */

import { getConsolidationConfig } from './openai-client';
import { loadKnownProductLines } from './product-lines';
import { normalizeProductSources } from '@/lib/product-sources';
import type { ProductLineClassificationInput, ProductLineClassificationResult } from './types';

/**
 * Confidence threshold for accepting a product line assignment.
 * Products classified below this threshold become Singletons (ungrouped).
 */
export const CLASSIFICATION_THRESHOLD = 0.80;

/**
 * Build minimal source evidence for classification.
 * Extracts the highest-signal fields from product sources: name, brand, category, product_family.
 */
export function extractClassificationEvidence(
    upc: string,
    sources: Record<string, unknown>,
    input?: Record<string, unknown> | null
): ProductLineClassificationInput['evidence'] {
    const normalizedSources = normalizeProductSources(sources);
    const sourceEntries = Object.entries(normalizedSources);

    let name: string | undefined;
    let brand: string | undefined;
    let category: string | undefined;
    let productFamily: string | undefined;

    for (const [, sourceData] of sourceEntries) {
        if (!sourceData || typeof sourceData !== 'object') continue;
        const s = sourceData as Record<string, unknown>;

        if (!name && typeof s.name === 'string' && s.name.trim()) name = s.name.trim();
        if (!brand && typeof s.brand === 'string' && s.brand.trim()) {
            brand = s.brand.trim().replace(/^brand\s*:\s*/i, '');
        }
        if (!category && typeof s.category === 'string' && s.category.trim()) category = s.category.trim();
        if (!productFamily) {
            if (typeof s.product_family === 'string' && s.product_family.trim()) {
                productFamily = s.product_family.trim();
            } else if (typeof s.product_line === 'string' && s.product_line.trim()) {
                productFamily = s.product_line.trim();
            } else if (typeof s.family === 'string' && s.family.trim()) {
                productFamily = s.family.trim();
            }
        }

        if (name && brand && category && productFamily) break;
    }

    // Fallback to input data
    if (!name && input && typeof (input as Record<string, unknown>).name === 'string') {
        name = (input as Record<string, unknown>).name as string;
    }
    if (!brand && input && typeof (input as Record<string, unknown>).brand === 'string') {
        brand = (input as Record<string, unknown>).brand as string;
    }

    return { name, brand, category, product_family: productFamily };
}

/**
 * Build a classification system prompt.
 * Includes known product lines as the allowed vocabulary and clear instructions.
 */
export function buildClassificationSystemPrompt(
    knownProductLines: Array<{ id: string; canonical_name: string }>
): string {
    const taxonomySection = knownProductLines.length > 0
        ? `Known product lines (pick from these when applicable; only invent a new line if none match):\n${
            knownProductLines.map(pl => `- ${pl.canonical_name}`).join('\n')
        }`
        : 'No existing product lines in taxonomy. Invent a concise, canonical manufacturer product line name.';

    return `You classify retail products into manufacturer product lines.

A "product line" is a family of SKU variants that share a brand, category, and naming pattern but differ by flavor, size, count, or material.

Rules:
- Look at the product name, brand, and category to identify the manufacturer's product line.
- If the product clearly belongs to an existing product line in the taxonomy, use that exact name.
- If no existing line matches, invent a concise canonical name (e.g., "Blue Buffalo Life Protection Formula").
- Return a confidence score (0.0-1.0) reflecting how certain you are of the assignment.
- Low confidence (<0.80) means the product may be a one-off or you're unsure. Flag it honestly.

${taxonomySection}

Output contract — respond with valid JSON matching this structure:
{
  "product_line": "string (required) — canonical manufacturer product line name",
  "confidence": "number (required) — 0.0 to 1.0. Below 0.80 means the product may be a singleton",
  "rationale": "string (required) — brief explanation of why this product was assigned to this line (or why confidence is low)"
}`;
}

/**
 * Build the user prompt for a single product classification.
 */
export function buildClassificationUserPrompt(evidence: ProductLineClassificationInput['evidence']): string {
    const parts: string[] = [];
    if (evidence.name) parts.push(`Product Name: ${evidence.name}`);
    if (evidence.brand) parts.push(`Brand: ${evidence.brand}`);
    if (evidence.category) parts.push(`Category: ${evidence.category}`);
    if (evidence.product_family) parts.push(`Source Product Family: ${evidence.product_family}`);

    return `Classify this product into a manufacturer product line:\n\n${parts.join('\n')}\n\nReturn JSON.`;
}

/**
 * Parse the LLM response text into a ProductLineClassificationResult.
 * Returns null if parsing fails or fields are invalid.
 */
export function parseClassificationResponse(
    upc: string,
    content: string
): ProductLineClassificationResult | null {
    let parsed: Record<string, unknown> | null = null;

    // Direct parse
    try {
        parsed = JSON.parse(content);
    } catch {
        // Try extracting from markdown code block
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            try {
                parsed = JSON.parse(jsonMatch[1]);
            } catch {
                // Try extracting JSON object
                const start = content.indexOf('{');
                const end = content.lastIndexOf('}') + 1;
                if (start >= 0 && end > start) {
                    try {
                        parsed = JSON.parse(content.slice(start, end));
                    } catch {
                        return null;
                    }
                } else {
                    return null;
                }
            }
        } else {
            // Last resort: try JSON object extraction
            const start = content.indexOf('{');
            const end = content.lastIndexOf('}') + 1;
            if (start >= 0 && end > start) {
                try {
                    parsed = JSON.parse(content.slice(start, end));
                } catch {
                    return null;
                }
            } else {
                return null;
            }
        }
    }

    if (!parsed || typeof parsed.product_line !== 'string' || !parsed.product_line.trim()) {
        return null;
    }

    const confidence = typeof parsed.confidence === 'number'
        ? parsed.confidence
        : typeof parsed.confidence === 'string'
            ? parseFloat(parsed.confidence)
            : null;

    if (confidence === null || isNaN(confidence) || confidence < 0 || confidence > 1) {
        return null;
    }

    const rationale = typeof parsed.rationale === 'string'
        ? parsed.rationale.trim()
        : 'No rationale provided';

    return {
        upc,
        product_line: parsed.product_line.trim(),
        confidence,
        rationale,
    };
}

/**
 * Classify a single product using the configured LLM provider.
 * Returns null for products that fail classification or fall below the threshold.
 */
export async function classifyProduct(
    upc: string,
    sources: Record<string, unknown>,
    input?: Record<string, unknown> | null,
    knownProductLines?: Array<{ id: string; canonical_name: string }>
): Promise<ProductLineClassificationResult | null> {
    const evidence = extractClassificationEvidence(upc, sources, input);

    if (!evidence.name && !evidence.brand) {
        return null; // Not enough data to classify
    }

    const taxonomy = knownProductLines || (await loadKnownProductLines()).map(pl => ({
        id: pl.id,
        canonical_name: pl.canonical_name,
    }));

    try {
        const config = await getConsolidationConfig();
        const systemPrompt = buildClassificationSystemPrompt(taxonomy);
        const userPrompt = buildClassificationUserPrompt(evidence);

        const apiKey = config.llm_api_key || '';
        const apiBase = config.llm_base_url || undefined;

        if (!apiKey && !apiBase) {
            console.error('[Classification] No LLM configuration available');
            return null;
        }

        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({
            apiKey: apiKey || 'default-key',
            baseURL: apiBase,
            timeout: 15000,
            maxRetries: 1,
        });

        const response = await client.chat.completions.create({
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 256,
            temperature: 0.1,
            response_format: { type: 'json_object' },
        } as any);

        const content = response.choices?.[0]?.message?.content || '';
        return parseClassificationResponse(upc, content);
    } catch (err) {
        console.error(`[Classification] Failed for ${upc}:`, err);
        return null;
    }
}

/**
 * Whether a classification result exceeds the confidence threshold for grouping.
 */
export function isConfidentClassification(result: ProductLineClassificationResult): boolean {
    return result.confidence >= CLASSIFICATION_THRESHOLD;
}
