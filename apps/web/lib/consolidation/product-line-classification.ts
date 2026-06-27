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
import { FLAVOR_WORDS, FORMAT_WORDS, FLAVOR_CLASSES, FORMAT_CLASSES } from './product-line-matcher';
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
        
        // Helper to check if input name contains flavor/format signal that trusted name is missing
        const hasAdditionalSignal = (inName: string, trName: string): boolean => {
            const lowerIn = inName.toLowerCase();
            const lowerTr = trName.toLowerCase();
            
            const hasInFlavor = FLAVOR_WORDS.some(w => lowerIn.includes(w));
            const hasTrFlavor = FLAVOR_WORDS.some(w => lowerTr.includes(w));
            if (hasInFlavor && !hasTrFlavor) return true;

            const hasInFormat = FORMAT_WORDS.some(w => lowerIn.includes(w));
            const hasTrFormat = FORMAT_WORDS.some(w => lowerTr.includes(w));
            if (hasInFormat && !hasTrFormat) return true;

            return false;
        };

        // Only use input name if no trusted source name was found, or if the trusted source
        // name lacks key flavor/format signals that the input name provides.
        if (!trustedName || hasAdditionalSignal(inputName, trustedName)) {
            trustedName = inputName;
        }
        // Always add input name to the cross-reference list (prefixed for visibility)
        allSourceNames.unshift(`[shopsite_input] ${inputName}`);
    }
    if (!trustedBrand && inputRecord?.brand && typeof inputRecord.brand === 'string') {
        trustedBrand = inputRecord.brand.trim();
    }

    // Scan sources for explicit flavor and format fields / facets
    let detectedFlavor: string | undefined;
    let detectedFormat: string | undefined;

    for (const [, sourceData] of sourceEntries) {
        if (!sourceData || typeof sourceData !== 'object') continue;
        const s = sourceData as Record<string, unknown>;

        // Check direct fields
        let fVal = s.flavor || s.flavour;
        let fmtVal = s.format || s.style || s.variant;

        // Check extracted.core/facets
        if (s.extracted && typeof s.extracted === 'object') {
            const ext = s.extracted as any;
            if (ext.core && typeof ext.core === 'object') {
                if (!fVal) fVal = ext.core.flavor || ext.core.flavour;
                if (!fmtVal) fmtVal = ext.core.format || ext.core.style || ext.core.variant;
            }
            if (Array.isArray(ext.facets)) {
                if (!fVal) {
                    const fFacet = ext.facets.find((f: any) => f && (f.definition_slug === 'flavor' || f.definition_slug === 'flavour'));
                    if (fFacet) fVal = fFacet.value;
                }
                if (!fmtVal) {
                    const fmtFacet = ext.facets.find((f: any) => f && (f.definition_slug === 'format' || f.definition_slug === 'style' || f.definition_slug === 'variant'));
                    if (fmtFacet) fmtVal = fmtFacet.value;
                }
            }
        }

        // Fallback: scan features array/string or other custom fields
        if (!fVal && typeof s.features === 'string' && s.features.toLowerCase().includes('flavor:')) {
            const match = s.features.match(/flavor:\s*([^;,\n]+)/i);
            if (match) fVal = match[1].trim();
        }

        if (typeof fVal === 'string' && fVal.trim().length > 0) {
            detectedFlavor = fVal.trim();
        }
        if (typeof fmtVal === 'string' && fmtVal.trim().length > 0) {
            detectedFormat = fmtVal.trim();
        }
    }

    // Fallback: Scan trustedName using token matching against classes
    if (trustedName) {
        const tokens = trustedName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
        if (!detectedFlavor) {
            for (const flavorClass of FLAVOR_CLASSES) {
                const match = flavorClass.find(w => tokens.includes(w));
                if (match) {
                    detectedFlavor = match.charAt(0).toUpperCase() + match.slice(1);
                    break;
                }
            }
        }
        if (!detectedFormat) {
            for (const formatClass of FORMAT_CLASSES) {
                const match = formatClass.find(w => tokens.includes(w));
                if (match) {
                    detectedFormat = match.charAt(0).toUpperCase() + match.slice(1);
                    break;
                }
            }
        }
    }

    return {
        name: trustedName,
        brand: trustedBrand,
        category,
        product_family: productFamily,
        allSourceNames,
        detected_flavor: detectedFlavor,
        detected_format: detectedFormat
    };
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

A "product line" represents a specific product flavor/formula and format (i.e. what represents a separate product page in a storefront).
- Products with different flavors (e.g. Chicken, Beef, Salmon) or different formats (e.g. Chewy Sticks, Chewy Bites) MUST belong to separate product lines.
- Different bag/can/package sizes, weights, and pack counts are quantity/size variants of the SAME product line, so they MUST be grouped under the exact same product line name.

Examples of GOOD product line names (flavor/format kept, size/pack stripped):
- "Earth Animal No-Hide Chew - Chicken" (not "Earth Animal No-Hide" — that combines multiple flavors like beef and chicken)
- "The Honest Kitchen Butcher Block Pate - Turkey" (not "The Honest Kitchen Butcher Block Pate" — that combines beef, chicken, and turkey)
- "Wholesomes Rewards Chewy Sticks - Beef" (not "Wholesomes Rewards Chewy Sticks" — that combines beef and salmon; and not "Wholesomes Rewards Chewy Sticks Beef 25oz" — that contains the bag size)
- "Purina Pro Plan Sensitive Skin & Stomach - Salmon" (not "Purina Pro Plan Sensitive Skin & Stomach")
- "Greenies Dental Chews - Blueberry" (not "Greenies Dental Chews" or "Dog Treats")

Examples of BAD product line names:
- "Dry Dog Food" — this is a category, not a product line
- "Wholesomes Rewards Chewy Sticks Beef 25oz" — this includes the package size/weight (25oz), which prevents it from grouping with the 7oz size variant
- "Earth Animal No-Hide" — too broad, lumps Chicken, Beef, Cheese, and Strawberry flavors together
- "The Honest Kitchen Crunchy Dog Treats" — too broad, lumps Cheddar, Gouda, and other flavors together

Rules:
- Extract the core manufacturer product line name, retaining the brand, product line family, format, and flavor/formula.
- DO NOT strip flavor, formula, scent, color, or primary form factors/formats (like "Sticks", "Bites", "Chews", "Pate", "Stew", "Rolls", "Stix", "Strips"). These distinguish distinct products.
- DO strip package size (e.g., "25oz", "7oz", "10.5oz", "4LB", "30 ML"), count/pack (e.g., "3PK", "6PK", "20PK", "2CT"), physical size terms (e.g., "Small", "Medium", "Large", "SM", "MD", "LG", "XL"), and container details (e.g., "Tube", "Can", "Bag").
- Use the "Detected Flavor" and "Detected Format" from the evidence when available. If present, your classified product line MUST incorporate them (e.g. "Wholesomes Rewards Chewy Sticks - Beef"). Products with different flavors or different formats MUST belong to separate product lines.
- If the product clearly belongs to an existing product line in the taxonomy AND that line is flavor-specific, use that EXACT name.
- If the existing product line in the taxonomy is too broad (e.g. lumps multiple flavors/formats together like "The Honest Kitchen Crunchy Dog Treats"), do NOT use it. Instead, invent/refine a flavor-specific product line (e.g. "The Honest Kitchen Crunchy Dog Treats - Gouda").
- If some source names contain flavor, formula, format, or product line details (e.g. "Beef", "Whitefish", "Bites", "Mini Sticks") but the trusted source name is generic (e.g. "Chewy Sticks"), you MUST incorporate the specific flavor/formula/format from the other source names to build the canonical product line. Do NOT use the generic name if a more specific flavor/formula exists in the inputs.
- Always prioritize flavor-specific product lines over generic ones when a flavor is present in any of the source names. If you see both a generic product line (e.g., "Wholesomes Rewards Chewy Sticks") and a flavor-specific product line (e.g., "Wholesomes Rewards Chewy Sticks Beef Dog Treats") in the known product lines list, and the product contains a flavor, you MUST choose or match to the flavor-specific product line (or invent a new flavor-specific one if it matches a different flavor).
- Marketplace sources (Amazon, eBay, Walmart) often pad names with SEO keywords like "human grade," "grain free," "natural," "premium." IGNORE these padding words.
- If multiple sources show different names for the same product, prefer the distributor/manufacturer source over marketplace sources.
- Look at the product name from the TRUSTED source (listed first) — it's cleaner and closer to the manufacturer's actual naming.
- If you see a pattern across multiple source names, use the common core as the product line.
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
export function buildClassificationUserPrompt(
    evidence: ProductLineClassificationInput['evidence'] & { allSourceNames?: string[] },
    siblings?: Array<{ upc: string; name: string }>
): string {
    const parts: string[] = [];
    if (evidence.brand) parts.push(`Brand: ${evidence.brand}`);
    if (evidence.name) parts.push(`Trusted Source Name: ${evidence.name}`);
    if (evidence.category) parts.push(`Category: ${evidence.category}`);
    if (evidence.product_family) parts.push(`Source Product Family: ${evidence.product_family}`);
    if (evidence.detected_flavor) parts.push(`Detected Flavor: ${evidence.detected_flavor}`);
    if (evidence.detected_format) parts.push(`Detected Format: ${evidence.detected_format}`);

    // Include all source names for cross-referencing
    if (evidence.allSourceNames && evidence.allSourceNames.length > 0) {
        parts.push(`\nAll source names for cross-reference:`);
        for (const sn of evidence.allSourceNames.slice(0, 6)) {
            parts.push(`  ${sn}`);
        }
    }

    // Include batch siblings
    if (siblings && siblings.length > 0) {
        parts.push(`\nOther products of the same brand in this batch (use to ensure consistent product line naming):`);
        for (const sib of siblings.slice(0, 10)) {
            parts.push(`  - ${sib.name} (UPC: ${sib.upc})`);
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

export interface ClassificationBatchProduct {
    upc: string;
    sources: Record<string, unknown>;
    input?: Record<string, unknown> | null;
}

/**
 * Coordinate prompt generation and brand/sibling checks for a batch of products to classify.
 */
export function prepareClassificationBatchItems(
    products: ClassificationBatchProduct[],
    knownProductLines: Array<{ id: string; canonical_name: string; brand_id: string | null }>,
    brandNameToId: Map<string, string>
): Array<{
    upc: string;
    systemPrompt: string;
    userPrompt: string;
}> {
    // Extract evidence for all products to find brand context and siblings
    const productEvidences = products.map(p => ({
        upc: p.upc,
        evidence: extractClassificationEvidence(p.upc, p.sources, p.input),
        sources: p.sources,
        input: p.input,
    }));

    // Group products by brand name for sibling lookup
    const productsByBrand = new Map<string, Array<{ upc: string; name: string }>>();
    for (const pe of productEvidences) {
        const bName = pe.evidence.brand?.trim().toLowerCase() || '__no_brand__';
        const list = productsByBrand.get(bName) || [];
        list.push({ upc: pe.upc, name: pe.evidence.name || pe.upc });
        productsByBrand.set(bName, list);
    }

    return productEvidences.map(pe => {
        const bName = pe.evidence.brand?.trim();
        const bId = bName ? brandNameToId.get(bName) : undefined;

        // Filter known product lines to this brand (or null brand)
        const brandLines = knownProductLines.filter(
            pl => pl.brand_id === null || (bId && pl.brand_id === bId)
        );

        const systemPrompt = buildClassificationSystemPrompt(
            brandLines.map(pl => ({ id: pl.id, canonical_name: pl.canonical_name }))
        );

        // Find siblings of the same brand in this batch (excluding self)
        const bKey = pe.evidence.brand?.trim().toLowerCase() || '__no_brand__';
        const siblings = (productsByBrand.get(bKey) || []).filter(sib => sib.upc !== pe.upc);

        const userPrompt = buildClassificationUserPrompt(pe.evidence, siblings);

        return {
            upc: pe.upc,
            systemPrompt,
            userPrompt,
        };
    });
}
