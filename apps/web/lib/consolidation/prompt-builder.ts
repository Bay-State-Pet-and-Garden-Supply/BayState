/**
 * Prompt Builder
 *
 * Generates system prompts for product consolidation with taxonomy constraints.
 * Ported and adapted from BayStateTools.
 */

import { normalizeProductSources, type CanonicalProductSourceRecord } from '@/lib/product-sources';
import type { ProductSource } from '@/lib/consolidation/types';
import {
    buildTaxonomyNodes,
    getLeafTaxonomyNodes,
    type TaxonomyCategoryNode,
    type TaxonomyCategoryRecord,
} from '@/lib/taxonomy';
import { FACET_PROFILE_APPLICABLE_FIELDS } from './category-domain';
import { getCanonicalFacetValues } from './facet-vocabulary';

const USER_PROMPT_PREFIX =
    'Consolidate this product into a ShopSite export-ready record using the provided source trust metadata and only source-supported values: ';
const MAX_SIBLING_PRODUCTS = 3;
const PROMPT_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;
const TRUSTED_SOURCE_FRAGMENTS = [
    'shopsite_input',
    'bradley',
    'central-pet',
    'central_pet',
    'orgill',
    'doitbest',
    'do_it_best',
    'manufacturer',
    'catalog',
    'distributor',
    'official_brand',
    'official-brand',
];
// Legacy enrichment pipeline produces AI-generated data — explicitly excluded from trusted
const ENRICHED_SOURCE_FRAGMENT = 'enriched';
const MARKETPLACE_SOURCE_FRAGMENTS = ['amazon', 'ebay', 'etsy', 'walmart', 'marketplace', 'seller'];
const CONSISTENCY_RULES = [
    'Keep the same BRAND across sibling products unless higher-trust evidence for this UPC clearly conflicts.',
    'Keep naming and description style aligned across the product line while preserving real variant differences.',
];

type SiblingProduct = NonNullable<ProductSource['productLineContext']>['siblings'][number];

interface SiblingProductPromptSummary {
    upc: string;
    name: string;
    brand?: string;
}

interface ProductLinePromptContext {
    product_line: string;
    sibling_products: SiblingProductPromptSummary[];
    consistency_rules: string[];
    expected_brand?: string;
    expected_category?: string;
    consistency_examples?: string[];
}

interface ConsolidationPromptPayload {
    upc: string;
    sources: Array<{
        source: string;
        trust: string;
        fields: Record<string, unknown>;
    }>;
    product_line_context?: ProductLinePromptContext;
}

interface ConsolidationPromptContext {
    systemPrompt: string;
    categories: string[];
}

let cachedPromptContext: ConsolidationPromptContext | null = null;
let cachedPromptContextExpiresAt = 0;

function trimString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : undefined;
}

function getSourcePromptRank(sourceName: string): number {
    const normalized = sourceName.toLowerCase();

    if (normalized === 'shopsite_input') {
        return 0;
    }

    if (TRUSTED_SOURCE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
        return 1;
    }

    if (MARKETPLACE_SOURCE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
        return 3;
    }

    return 2;
}

function getPreferredPromptSources(rawSources: Record<string, unknown>): CanonicalProductSourceRecord[] {
    return Object.entries(normalizeProductSources(rawSources))
        .sort(([left], [right]) => getSourcePromptRank(left) - getSourcePromptRank(right))
        .map(([, source]) => source);
}

function getSourceBrand(source: CanonicalProductSourceRecord): string | undefined {
    const brand = trimString(source.brand);
    return brand ? brand.replace(/^brand\s*:\s*/i, '').trim() : undefined;
}

function getSiblingBrand(rawSources: Record<string, unknown>): string | undefined {
    for (const source of getPreferredPromptSources(rawSources)) {
        const brand = getSourceBrand(source);
        if (brand) {
            return brand;
        }
    }

    return undefined;
}

function buildSiblingProductSummary(sibling: SiblingProduct): SiblingProductPromptSummary {
    return {
        upc: sibling.upc,
        name: trimString(sibling.name) || sibling.upc,
        ...(getSiblingBrand(sibling.sources) ? { brand: getSiblingBrand(sibling.sources) } : {}),
    };
}

function buildProductLinePromptContext(product: ProductSource): ProductLinePromptContext | undefined {
    const context = product.productLineContext;
    if (!context) {
        return undefined;
    }

    const siblingProducts = context.siblings
        .slice(0, MAX_SIBLING_PRODUCTS)
        .map((sibling) => buildSiblingProductSummary(sibling));
    const expectedBrand = trimString(context.expectedBrand);
    const expectedCategory = trimString(context.expectedCategory);
    const consistencyExamples = siblingProducts
        .map((sibling) => sibling.name)
        .filter((name) => name.trim().length > 0)
        .slice(0, 3);

    if (siblingProducts.length === 0 && !expectedBrand && !expectedCategory) {
        return undefined;
    }

    return {
        product_line: trimString(context.productLine) || product.upc,
        sibling_products: siblingProducts,
        consistency_rules: [
            ...CONSISTENCY_RULES,
            expectedCategory 
                ? `Prefer the expected_category "${expectedCategory}" for this product to keep category consistency across the product line.`
                : 'Keep category categorization consistent across sibling products.'
        ],
        ...(expectedBrand ? { expected_brand: expectedBrand } : {}),
        ...(expectedCategory ? { expected_category: expectedCategory } : {}),
        ...(consistencyExamples.length >= 2 ? { consistency_examples: consistencyExamples } : {}),
    };
}

export function buildUserPromptPayload(
    product: ProductSource,
    sourceEvidence: ConsolidationPromptPayload['sources']
): ConsolidationPromptPayload {
    const productLineContext = buildProductLinePromptContext(product);

    return {
        upc: product.upc,
        sources: sourceEvidence,
        ...(productLineContext ? { product_line_context: productLineContext } : {}),
    };
}

export function buildUserPrompt(
    product: ProductSource,
    sourceEvidence: ConsolidationPromptPayload['sources']
): string {
    return `${USER_PROMPT_PREFIX}${JSON.stringify(buildUserPromptPayload(product, sourceEvidence))}`;
}

/**
 * Fetch categories from the database.
 */
async function getCategories() {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id, department_key, depth, breadcrumb, display_order, description, image_url, is_featured')
        .eq('is_active', true)
        .order('display_order')
        .order('name');

    if (error) {
        console.error('[Consolidation] Failed to fetch categories:', error);
        return [];
    }

    return getLeafTaxonomyNodes((data || []) as TaxonomyCategoryRecord[]);
}

/**
 * Build a compact, department-grouped category list for the prompt.
 * Groups leaf categories under their L1 > L2 path to conserve tokens.
 */
function buildGroupedCategoryList(categoryNodes: TaxonomyCategoryNode[]): string[] {
    // Group leaves by their ancestor department_path:L2_path
    const groups = new Map<string, string[]>();

    for (const node of categoryNodes) {
        if (!node.is_leaf) continue;
        const ancestorNames = node.ancestor_names;
        // Get L1 and L2 ancestors
        const l1 = ancestorNames[0] || '';
        const l2 = ancestorNames[1] || '';
        const groupKey = l1 ? `${l1} > ${l2}` : l1 || 'Other';
        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(node.name);
    }

    // Build compact grouped strings — keep within ~4000 char budget
    const MAX_CATEGORY_CHARS = 4000;
    const lines: string[] = [];
    let totalChars = 0;

    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

    for (const [groupKey, items] of sortedGroups) {
        const header = `  ${groupKey}:`;
        // Show up to 8 examples per group, then "+N more"
        const MAX_EXAMPLES = 8;
        const shown = items.slice(0, MAX_EXAMPLES);
        const more = items.length > MAX_EXAMPLES ? ` +${items.length - MAX_EXAMPLES} more` : '';
        const itemLine = ` ${shown.join(', ')}${more}`;
        const groupLine = `${header}${itemLine}`;

        if (totalChars + groupLine.length > MAX_CATEGORY_CHARS && lines.length > 0) {
            // Still include a note that more exist
            lines.push(`  ... and ${sortedGroups.length - lines.length} more category groups (use exact breadcrumb from source)`);
            break;
        }
        lines.push(groupLine);
        totalChars += groupLine.length;
    }

    if (lines.length === 0) {
        return ['(none configured)'];
    }
    return lines;
}

function buildFacetProfileRulesString(): string {
    return Object.entries(FACET_PROFILE_APPLICABLE_FIELDS)
        .map(([profile, fields]) => `- ${profile}: allows fields [${fields.join(', ')}]`)
        .join('\n');
}

/**
 * Generate the system prompt for product consolidation.
 * Includes taxonomy constraints and formatting rules.
 * Categories can be either flat breadcrumb strings or pre-grouped lines
 * (as produced by buildGroupedCategoryList).
 */
export function generateSystemPrompt(categories: string[], facetVocabulary?: Map<string, string[]>): string {
    const allowedCategoriesStr = categories.length > 0
        ? categories.join('\n')
        : '(none configured)';
    const profileRulesStr = buildFacetProfileRulesString();

    let vocabRulesStr = '';
    if (facetVocabulary && facetVocabulary.size > 0) {
        vocabRulesStr = '\n\nFacet Value Constraints:\nFor the following fields, you MUST use ONLY values from these lists if they match the product details (select the best-fitting canonical value, case-insensitive):\n';
        for (const [slug, values] of facetVocabulary.entries()) {
            if (values.length > 0) {
                // List up to 50 values to keep prompt size manageable.
                const displayedValues = values.slice(0, 50).join(' | ');
                vocabRulesStr += `- ${slug}: ${displayedValues}${values.length > 50 ? ' | ...' : ''}\n`;
            }
        }
    }

    return `You consolidate multi-source product data into one ShopSite export-ready product record.

Use only exact source-supported category values.

Prioritize outputs that are ready for ShopSite export: name, brand, and weight.

Source trust rules:
- Highest trust: "shopsite_input" for current ShopSite assignments.
- High trust: manufacturer, distributor, and catalog sources for factual product data.
- Lower trust: marketplace and retailer listings such as Amazon, Walmart, eBay, and seller-provided labels.
- When sources conflict on brand or category, prefer the highest-trust source with direct evidence.
- Preserve shopsite_input category unless higher-trust evidence clearly supports a change.
- Never let marketplace seller labels or "Brand: ..." prefixes override higher-trust brand evidence.

Sibling product context:
- Use sibling product context only as consistency guidance when it is provided.
- Keep supported naming and brand patterns aligned across related UPCs without inventing details from siblings.

OCR Packaging Evidence and Vision Input:
- When a source provides image_text (OCR extracted from product packaging photos), or when you are provided with physical product packaging images directly, treat this visual/OCR packaging evidence as the absolute source of truth.
- Match the packaging name, brand, and size/weight as closely as possible. Strip extraneous text: marketing taglines, legal disclaimers, address blocks, barcode numbers, URLs, social handles, and promotional callouts.
- If packaging evidence conflicts with marketplace or distributor titles on product name, brand, or other details, prefer the packaging evidence.
- Inspect the physical product packaging images directly to extract packaging details.
- If images are expected but missing, blurry, or unreadable/illegible, fall back gracefully to the text sources, but set a lower confidence_score (below 0.80) to flag the product for human review.
- Never fabricate packaging details not present in the images or image_text.

Product-name rules:
- Brand MUST be the first token in the product name, separated by a space. Never drop the brand from the name.
- Example: brand "Blue Buffalo" + name "Dog Food" → "Blue Buffalo Dog Food"
- If the source name already starts with the brand, keep it; do not duplicate the brand.
- Use the brand spelling from the highest-trust source. Use case-insensitive brand matching to avoid duplication. No "Brand:" prefix in the name.
- For consumable and food products, place the food-type descriptor directly before the size/weight: prefer "Dry Dog Food 30 lb." over "Dog Food 30 lb. Dry" or "Dog Food Dry 30 lb."
- General pattern: [Brand] [Product-Type Descriptor] [Flavor/Variant if distinct and source-supported] [Size/Weight/Count]
- Keep names in Title Case with size/weight/count at the end.
- Never truncate words or use ellipses.
- Never produce identical names for distinguishable variants; include source-supported differentiators and do not invent variant details.
- Same product, different colors: "Motorsport Container Red 5 Gal.", "Motorsport Container White 5 Gal.", "Motorsport Container Yellow 5 Gal."
- Same product line, different flavors/scents: "SPOT BAMBONE Coffee Wood Bacon 7 in.", "SPOT BAMBONE Coffee Wood Chicken 7 in." — flavor MUST be included when sources show different flavors for different UPCs.
- Same product line, different materials: "SPOT BAMBONE Eco Knot Bone 7.5 in.", "SPOT BAMBONE Eco Knot Bone 7.5 in." — material/type MUST be included when sources show different materials.
- If two UPCs have different flavor, color, scent, or material in their source data, the name MUST include that differentiator. Do not omit it.
- Remove special characters like TM, R, and C marks.
- Use unit periods: lb., oz., ct., in., ft., gal., qt., pt., pk., sq. ft.
- Expand common abbreviations like Sm, Md, Lg, Blk, Wht, Brn, Grn, Rd, Bl, Yl, Org, Pnk, Prpl, Gry, Asst, Asstd, Med, Lrg, Sml.
- Preserve source-supported decimal size, weight, and count values in names. Do not round or truncate 1.06 oz. to 1 oz. or 4.5 lb. to 4 lb.
- Use uppercase X with spaces for dimensions, for example 3 X 25 ft. or 11 X 17 in.

Description rules:
- ALWAYS write a custom product description following the exact template pattern below. Never copy description text verbatim from the source data.
- Template pattern: [Full product name] is a [product type] for [target animal/use]. [1-2 sentences on key features/benefits from source data]. [Size/weight/count].
- Example: "Blue Buffalo Life Protection Dry Dog Food 30 lb. is a dry dog food for dogs. Formulated with real deboned chicken to support muscle maintenance and healthy digestion. Available in a 30 lb. bag."
- Keep descriptions professional, concise, factual, and strictly based on the source data (never invent or hallucinate features).
- Keep descriptions between 2 to 3 sentences maximum.
- Use only plain ASCII characters (avoid curly quotes, en/em-dashes, or special Unicode characters; use standard single/double quotes and hyphens instead).

Field rules:
- weight: numeric string in pounds only, no units. Preserve source-supported precision up to 2 decimal places. If there is no trustworthy weight, return null.
- confidence_score: 0.80-1.00 means ready for immediate ShopSite export, 0.50-0.79 means usable with review, and below 0.50 means key fields remain uncertain. Set below 0.80 if packaging images are expected but missing or unreadable/illegible.

Facet Profile Field Matrix:
When extracting \`packaging_facets\`, you MUST determine the logical Facet Profile based on the category you select, and ONLY extract fields allowed for that profile.
${profileRulesStr}${vocabRulesStr}

Output contract — respond with valid JSON matching this structure:
{
  "name": "string (required) — product name with brand as first token",
  "brand": "string (required) — brand name exactly as in highest-trust source",
  "weight": "string (required) — numeric weight in pounds, no units. null if no trustworthy weight",
  "confidence_score": "number (required) — 0.0 to 1.0. 0.80+ = export-ready. set below 0.80 if images are missing or unreadable",
  "category": "string (required) — best-fit taxonomy category from allowed list",
  "description": "string (required) — custom product description written according to the Description rules, using the template pattern: [Full product name] is a [product type] for [target animal/use]. [1-2 sentences on key features/benefits]. [Size/weight/count].",
  "search_keywords": "string (required) — comma-separated keywords from source data",
  "packaging_facets": "object (optional) — key-value pairs extracted from source data and/or packaging images. You MUST select the appropriate Facet Profile for your chosen category using the matrix above, and ONLY use keys from that profile's allowed fields. Map values as clean, normalized strings."
}

Allowed category values (use exactly one). Choose the full breadcrumb (e.g. "Dog > Food > Dry Food") from the allowed categories below:
${allowedCategoriesStr}

Every required field must be non-empty.`;
}

/**
 * Build the complete prompt context with taxonomy.
 */
export async function buildPromptContext(): Promise<ConsolidationPromptContext> {
    if (cachedPromptContext && Date.now() < cachedPromptContextExpiresAt) {
        return {
            systemPrompt: cachedPromptContext.systemPrompt,
            categories: [...cachedPromptContext.categories],
        };
    }

    const categoryRecords = await getCategories();
    const categories = categoryRecords.map((category) => category.breadcrumb ?? category.name);

    let vocabulary: Map<string, string[]> | undefined;
    try {
        vocabulary = await getCanonicalFacetValues();
    } catch (err) {
        console.error('[Consolidation] Failed to load facet vocabulary for prompt:', err);
    }

    // Use compact grouped format for the prompt to fit ~200+ leaves in ~4000 chars.
    // The prompt asks the model to pick an exact category using full breadcrumb matches,
    // and the grouped lines still show full breadcrumbs like "Dog > Food: Dry Food, Wet Food..."
    const groupedCategoryLines = buildGroupedCategoryList(categoryRecords);

    cachedPromptContext = {
        systemPrompt: generateSystemPrompt(groupedCategoryLines, vocabulary),
        categories,
    };
    cachedPromptContextExpiresAt = Date.now() + PROMPT_CONTEXT_CACHE_TTL_MS;

    return {
        systemPrompt: cachedPromptContext.systemPrompt,
        categories: [...cachedPromptContext.categories],
    };
}

/**
 * Generate a system prompt for group consolidation (multiple products in one call).
 * Uses the same rules as the single-product prompt but with a multi-product output contract.
 */
export function generateGroupConsolidationSystemPrompt(
    categories: string[],
    productLineName: string,
    productCount: number
): string {
    const singlePrompt = generateSystemPrompt(categories);

    // Build the multi-product output contract to replace the single-product one
    const groupOutputContract = `
Group consolidation output contract — respond with valid JSON matching this structure:
{
  "products": {
    "UPC123": {
      "name": "string (required) — product name with brand as first token",
      "brand": "string (required) — must be IDENTICAL across all products in this group",
      "weight": "string (required) — numeric weight in pounds, no units. null if no trustworthy weight",
      "confidence_score": "number (required) — 0.0 to 1.0",
      "category": "string (required) — must be IDENTICAL across all products in this group",
      "description": "string (required) — custom product description following the Description rules",
      "search_keywords": "string (required) — comma-separated keywords",
      "packaging_facets": "object (optional)"
    },
    ...one entry per UPC (${productCount} UPCs total)
  }
}

CRITICAL:
- You MUST include EVERY UPC listed in the input. Do not skip, omit, or add UPCs.
- Brand MUST be identical across all products in this group.
- Category MUST be identical across all products in this group.
- Names MUST follow a consistent template within the group, with only variant-specific differences (flavor, size, count).
- Descriptions MUST share a common structure with variant-specific details.
- This is a product line: "${productLineName}". All products belong to this same manufacturer product line.
`;

    // Find the output contract section and the Allowed category values section
    const outputStart = singlePrompt.indexOf('Output contract');
    const afterContract = singlePrompt.indexOf('Allowed category values');
    
    if (outputStart >= 0 && afterContract > outputStart) {
        const before = singlePrompt.slice(0, outputStart);
        const after = singlePrompt.slice(afterContract);
        return before + groupOutputContract + after;
    }

    // Fallback: append the group contract at the end
    return singlePrompt + groupOutputContract;
}

/**
 * Build a user prompt payload string for a group consolidation call.
 * Includes source evidence for all UPCs in the group.
 *
 * @param products - Array of products with their source evidence already built and sorted
 * @param productLineName - The canonical product line label for the group
 * @returns A JSON-stringified payload for the user prompt
 */
export function buildGroupUserPromptPayload(
    products: Array<{
        upc: string;
        sources: Array<{
            source: string;
            trust: string;
            fields: Record<string, unknown>;
        }>;
    }>,
    productLineName: string
): string {
    const payload = {
        product_line: productLineName,
        product_count: products.length,
        instructions: [
            'Consolidate all products below into ShopSite export-ready records.',
            'Use only exact source-supported category values.',
            'Brand and category must be IDENTICAL across all products.',
            'Names must follow a consistent template with variant-specific differences.',
            'Include EVERY UPC in your output — do not skip any.',
        ],
        products: products.map(p => ({
            upc: p.upc,
            sources: p.sources,
        })),
    };

    return JSON.stringify(payload);
}
