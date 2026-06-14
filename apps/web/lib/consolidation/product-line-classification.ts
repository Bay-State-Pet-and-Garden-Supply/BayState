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
/**
 * Source trust priority: prefer trusted distributor/manufacturer sources over marketplace.
 * Lower number = higher trust.
 */
function getSourceTrustRank(sourceName: string): number {
    const lower = sourceName.toLowerCase();
    if (lower === 'shopsite_input') return 0;
    if (/(bradley|central.pet|orgill|doitbest|do_it_best|manufacturer|catalog|distributor|official_brand|official-brand)/.test(lower)) return 1;
    // Legacy enrichment pipeline produces AI-generated names — trust below real scraper data
    if (lower === 'enriched') return 3;
    if (/(amazon|ebay|etsy|walmart|marketplace|seller|shop|ai_search)/.test(lower)) return 3;
    return 2;
}

export function extractClassificationEvidence(
    upc: string,
    sources: Record<string, unknown>,
    input?: Record<string, unknown> | null
): ProductLineClassificationInput['evidence'] & { allSourceNames: string[] } {
    const normalizedSources = normalizeProductSources(sources);
    
    // Sort source entries by trust rank
    const sourceEntries = Object.entries(normalizedSources)
        .sort(([a], [b]) => getSourceTrustRank(a) - getSourceTrustRank(b));

    let trustedName: string | undefined;
    let trustedBrand: string | undefined;
    let category: string | undefined;
    let productFamily: string | undefined;
    const allSourceNames: string[] = [];

    for (const [sourceName, sourceData] of sourceEntries) {
        if (!sourceData || typeof sourceData !== 'object') continue;
        const s = sourceData as Record<string, unknown>;

        // Collect product names from all sources for cross-referencing
        const srcName = typeof s.name === 'string' ? s.name.trim() : (typeof s.title === 'string' ? s.title.trim() : undefined);
        const srcTitle = typeof s.title === 'string' ? s.title.trim() : undefined;
        if (srcTitle) allSourceNames.push(`[${sourceName}] ${srcTitle}`);
        else if (srcName) allSourceNames.push(`[${sourceName}] ${srcName}`);

        // Prefer trusted sources for name and brand
        if (!trustedName) {
            if (srcName) trustedName = srcName;
            else if (srcTitle) trustedName = srcTitle;
        }
        if (!trustedBrand && typeof s.brand === 'string' && s.brand.trim()) {
            trustedBrand = s.brand.trim().replace(/^brand\s*:\s*/i, '');
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
    }

    // ShopSite input data is the original import — treat as highest trust for product line detection.
    // It typically has the cleanest, most canonical product names (e.g. "HONEST KITCHEN BUTCH ER PATE TRKY 10.5OZ").
    const inputRecord = input as Record<string, unknown> | null | undefined;
    if (inputRecord?.name && typeof inputRecord.name === 'string' && inputRecord.name.trim()) {
        const inputName = inputRecord.name.trim();
        // Only use input name if no trusted source name was found, or if the trusted source
        // name looks generic/SEO-padded. Input names from ShopSite are typically cleaner.
        if (!trustedName) {
            trustedName = inputName;
        }
        // Always add input name to the cross-reference list (prefixed for visibility)
        allSourceNames.unshift(`[shopsite_input] ${inputName}`);
    }
    if (!trustedBrand && inputRecord?.brand && typeof inputRecord.brand === 'string') {
        trustedBrand = inputRecord.brand.trim();
    }

    return { name: trustedName, brand: trustedBrand, category, product_family: productFamily, allSourceNames };
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

A "product line" is the SPECIFIC name a manufacturer uses for a family of SKU variants. It is NOT a generic category description. Think of it as what the manufacturer prints on the packaging.

Examples of GOOD product line names:
- "Blue Buffalo Life Protection Formula" (not "Dry Dog Food" — that's a category)
- "Butcher Block Pate" (not "Wet Dog Food" or "Human Grade Wet Dog Food")
- "Purina Pro Plan Sensitive Skin & Stomach" (not "Salmon Dog Food")
- "Greenies Dental Chews" (not "Dog Treats")
- "SPOT BAMBONE Coffee Wood" (not "Dog Chew Toy")

Examples of BAD product line names (too generic — these are categories, not product lines):
- "Dry Dog Food" — this describes the product type, not the manufacturer's line
- "Human Grade Wet Dog Food" — this is a category + marketing claim, not a product line
- "Dog Treats" — far too broad

Rules:
- Extract the core manufacturer product line from the product name, stripping marketing fluff.
- Marketplace sources (Amazon, eBay, Walmart) often pad names with SEO keywords like "human grade," "grain free," "natural," "premium." IGNORE these padding words — focus on the actual product line name.
- If multiple sources show different names for the same product, prefer the distributor/manufacturer source over marketplace sources.
- Look at the product name from the TRUSTED source (listed first) — it's cleaner and closer to the manufacturer's actual naming.
- If you see a pattern across multiple source names, use the common core as the product line.
- If the product clearly belongs to an existing product line in the taxonomy, use that EXACT name.
- Return a confidence score. Low confidence (<0.80) means the product may be a one-off.

${taxonomySection}

Output contract — respond with valid JSON matching this structure:
{
  "product_line": "string (required) — canonical manufacturer product line name (NOT a generic category)",
  "confidence": "number (required) — 0.0 to 1.0",
  "rationale": "string (required) — why this product line was assigned (or why confidence is low)"
}`;
}

/**
 * Build the user prompt for a single product classification.
 * Includes source names from all sources for cross-referencing.
 */
export function buildClassificationUserPrompt(evidence: ProductLineClassificationInput['evidence'] & { allSourceNames?: string[] }): string {
    const parts: string[] = [];
    if (evidence.brand) parts.push(`Brand: ${evidence.brand}`);
    if (evidence.name) parts.push(`Trusted Source Name: ${evidence.name}`);
    if (evidence.category) parts.push(`Category: ${evidence.category}`);
    if (evidence.product_family) parts.push(`Source Product Family: ${evidence.product_family}`);

    // Include all source names for cross-referencing
    if (evidence.allSourceNames && evidence.allSourceNames.length > 0) {
        parts.push(`\nAll source names for cross-reference:`);
        for (const sn of evidence.allSourceNames.slice(0, 6)) {
            parts.push(`  ${sn}`);
        }
    }

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
            max_tokens: 512,
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
