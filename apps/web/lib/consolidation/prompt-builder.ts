/**
 * Prompt Builder
 *
 * Generates system prompts for product consolidation with taxonomy constraints.
 * Ported and adapted from BayStateTools.
 */

import { SHOPSITE_PAGES } from '@/lib/shopsite/constants';
import { normalizeProductSources, type CanonicalProductSourceRecord } from '@/lib/product-sources';
import type { ProductSource } from '@/lib/consolidation/types';
import {
    getLeafTaxonomyNodes,
    type TaxonomyCategoryRecord,
} from '@/lib/taxonomy';

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
];
const MARKETPLACE_SOURCE_FRAGMENTS = ['amazon', 'ebay', 'etsy', 'walmart', 'marketplace', 'seller'];
const CONSISTENCY_RULES = [
    'Keep the same BRAND across sibling products unless higher-trust evidence for this SKU clearly conflicts.',
    'Keep naming and description style aligned across the product line while preserving real variant differences.',
];

type SiblingProduct = NonNullable<ProductSource['productLineContext']>['siblings'][number];

interface SiblingProductPromptSummary {
    sku: string;
    name: string;
    brand?: string;
}

interface ProductLinePromptContext {
    product_line: string;
    sibling_products: SiblingProductPromptSummary[];
    consistency_rules: string[];
    expected_brand?: string;
    consistency_examples?: string[];
}

export interface ConsolidationPromptPayload {
    sku: string;
    sources: Array<{
        source: string;
        trust: string;
        fields: Record<string, unknown>;
    }>;
    product_line_context?: ProductLinePromptContext;
}

export interface ConsolidationPromptContext {
    systemPrompt: string;
    shopsitePages: string[];
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
        sku: sibling.sku,
        name: trimString(sibling.name) || sibling.sku,
        ...(getSiblingBrand(sibling.sources) ? { brand: getSiblingBrand(sibling.sources) } : {}),
    };
}

export function buildProductLinePromptContext(product: ProductSource): ProductLinePromptContext | undefined {
    const context = product.productLineContext;
    if (!context) {
        return undefined;
    }

    const siblingProducts = context.siblings
        .slice(0, MAX_SIBLING_PRODUCTS)
        .map((sibling) => buildSiblingProductSummary(sibling));
    const expectedBrand = trimString(context.expectedBrand);
    const consistencyExamples = siblingProducts
        .map((sibling) => sibling.name)
        .filter((name) => name.trim().length > 0)
        .slice(0, 3);

    if (siblingProducts.length === 0 && !expectedBrand) {
        return undefined;
    }

    return {
        product_line: trimString(context.productLine) || product.sku,
        sibling_products: siblingProducts,
        consistency_rules: [...CONSISTENCY_RULES],
        ...(expectedBrand ? { expected_brand: expectedBrand } : {}),
        ...(consistencyExamples.length >= 2 ? { consistency_examples: consistencyExamples } : {}),
    };
}

export function buildUserPromptPayload(
    product: ProductSource,
    sourceEvidence: ConsolidationPromptPayload['sources']
): ConsolidationPromptPayload {
    const productLineContext = buildProductLinePromptContext(product);

    return {
        sku: product.sku,
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
export async function getCategories() {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id, description, display_order, image_url, is_featured')
        .order('display_order')
        .order('name');

    if (error) {
        console.error('[Consolidation] Failed to fetch categories:', error);
        return [];
    }

    return getLeafTaxonomyNodes((data || []) as TaxonomyCategoryRecord[]);
}

/**
 * Generate the system prompt for product consolidation.
 * Includes taxonomy constraints and formatting rules.
 */
export function generateSystemPrompt(categories: string[]): string {
    const schemaConstraintInstruction =
        categories.length > 0
            ? 'The response schema already constrains allowed category and product_on_pages values. Use only exact schema values.'
            : 'Use only exact source-supported category and product_on_pages values.';

    return `You consolidate multi-source product data into one ShopSite export-ready product record.

${schemaConstraintInstruction} Never invent ShopSite page names.

Prioritize outputs that are ready for ShopSite export: name, brand, weight, and product_on_pages.

Source trust rules:
- Highest trust: "shopsite_input" for current ShopSite assignments.
- High trust: manufacturer, distributor, and catalog sources for factual product data.
- Lower trust: marketplace and retailer listings such as Amazon, Walmart, eBay, and seller-provided labels.
- When sources conflict on brand or product_on_pages, prefer the highest-trust source with direct evidence.
- Preserve shopsite_input product_on_pages unless higher-trust evidence clearly supports a change.
- Never let marketplace seller labels or "Brand: ..." prefixes override higher-trust brand evidence.

Sibling product context:
- Use sibling product context only as consistency guidance when it is provided.
- Keep supported naming and brand patterns aligned across related SKUs without inventing details from siblings.

Product-name rules:
- Exclude brand from the product name; put it only in brand.
- Brand at start: "Blue Buffalo Dog Food" → "Dog Food"
- Brand in middle: "Dog Food by Blue Buffalo" → "Dog Food"
- Brand at end: "Dog Food Blue Buffalo" → "Dog Food"
- Use case-insensitive brand matching.
- Keep names in Title Case with size/weight/count at the end.
- Never truncate words or use ellipses.
- Never produce identical names for distinguishable variants; include source-supported differentiators and do not invent variant details.
- Same product, different colors: "Motorsport Container Red 5 Gal.", "Motorsport Container White 5 Gal.", "Motorsport Container Yellow 5 Gal."
- Remove special characters like TM, R, and C marks.
- Use unit periods: lb., oz., ct., in., ft., gal., qt., pt., pk., sq. ft.
- Expand common abbreviations like Sm, Md, Lg, Blk, Wht, Brn, Grn, Rd, Bl, Yl, Org, Pnk, Prpl, Gry, Asst, Asstd, Med, Lrg, Sml.
- Preserve source-supported decimal size, weight, and count values in names. Do not round or truncate 1.06 oz. to 1 oz. or 4.5 lb. to 4 lb.
- Use uppercase X with spaces for dimensions, for example 3 X 25 ft. or 11 X 17 in.

Field rules:
- weight: numeric string in pounds only, no units. Preserve source-supported precision up to 2 decimal places. If there is no trustworthy weight, return null.
- product_on_pages: match the customer shopping intent. Planting seed products should use Seeds & Seed Starting and can also use Lawn & Garden Shop All when supported. Do not use Farm Animal, Bird, Small Pet, or Wild Bird pages for seed products unless trusted source descriptions explicitly indicate feed or treat intent.
- product_on_pages: never use service-only pages such as #Services for a physical retail product unless the trusted source clearly describes a service, rental, refill, pickup, or delivery offering.
- confidence_score: 0.80-1.00 means ready for immediate ShopSite export, 0.50-0.79 means usable with review, and below 0.50 means key fields remain uncertain.

Return valid JSON only through the response schema. Every required string field must be non-empty.`;
}

/**
 * Build the complete prompt context with taxonomy.
 */
export async function buildPromptContext(): Promise<ConsolidationPromptContext> {
    if (cachedPromptContext && Date.now() < cachedPromptContextExpiresAt) {
        return {
            systemPrompt: cachedPromptContext.systemPrompt,
            shopsitePages: [...cachedPromptContext.shopsitePages],
            categories: [...cachedPromptContext.categories],
        };
    }

    const categoryRecords = await getCategories();
    const categories = categoryRecords.map((category) => category.breadcrumb ?? category.name);

    cachedPromptContext = {
        systemPrompt: generateSystemPrompt(categories),
        shopsitePages: [...SHOPSITE_PAGES],
        categories,
    };
    cachedPromptContextExpiresAt = Date.now() + PROMPT_CONTEXT_CACHE_TTL_MS;

    return {
        systemPrompt: cachedPromptContext.systemPrompt,
        shopsitePages: [...cachedPromptContext.shopsitePages],
        categories: [...cachedPromptContext.categories],
    };
}
