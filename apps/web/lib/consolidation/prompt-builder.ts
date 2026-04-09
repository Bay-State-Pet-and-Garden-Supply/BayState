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
    'Consolidate this product into a canonical record using the provided source trust metadata and only source-supported values: ';
const MAX_SIBLING_PRODUCTS = 5;
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
    'Prefer the same deepest CATEGORY taxonomy pattern used by siblings when the purchase intent matches.',
    'Keep naming and description style aligned across the product line while preserving real variant differences.',
];

type SiblingProduct = NonNullable<ProductSource['productLineContext']>['siblings'][number];

interface SiblingProductPromptSummary {
    sku: string;
    name: string;
    brand?: string;
    category?: string;
}

interface ProductLinePromptContext {
    product_line: string;
    sibling_products: SiblingProductPromptSummary[];
    consistency_rules: string[];
    expected_brand?: string;
    expected_category?: string;
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

function getSourceCategory(source: CanonicalProductSourceRecord): string | undefined {
    const category = trimString(source.category);
    if (category) {
        return category;
    }

    if (Array.isArray(source.categories)) {
        return source.categories.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
    }

    return undefined;
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

function getSiblingCategory(rawSources: Record<string, unknown>): string | undefined {
    for (const source of getPreferredPromptSources(rawSources)) {
        const category = getSourceCategory(source);
        if (category) {
            return category;
        }
    }

    return undefined;
}

function buildSiblingProductSummary(sibling: SiblingProduct): SiblingProductPromptSummary {
    return {
        sku: sibling.sku,
        name: trimString(sibling.name) || sibling.sku,
        ...(getSiblingBrand(sibling.sources) ? { brand: getSiblingBrand(sibling.sources) } : {}),
        ...(getSiblingCategory(sibling.sources) ? { category: getSiblingCategory(sibling.sources) } : {}),
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
    const expectedCategory = trimString(context.expectedCategory);
    const consistencyExamples = siblingProducts
        .map((sibling) => sibling.name)
        .filter((name) => name.trim().length > 0)
        .slice(0, 3);

    if (siblingProducts.length === 0 && !expectedBrand && !expectedCategory) {
        return undefined;
    }

    return {
        product_line: trimString(context.productLine) || product.sku,
        sibling_products: siblingProducts,
        consistency_rules: [...CONSISTENCY_RULES],
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
    const categoryGuidance =
        categories.length > 0
            ? `\n- ${categories.join('\n- ')}`
            : '\n- No category values were provided.';
    const pageGuidance = SHOPSITE_PAGES.join(', ');

    return `You consolidate multi-source product data into one storefront-ready canonical record.

Use only values allowed by the response schema for category and product_on_pages.

Taxonomy rules:
- Classify from the product's actual function, ingredients, materials, form factor, and intended animal/use case.
- Ignore legacy category strings when stronger evidence from the product name, description, attributes, or trusted sources points elsewhere.
- Choose the deepest valid leaf taxonomy breadcrumb that best represents the primary purchase intent.
- Do not return broad parent-only categories when a more specific leaf exists.
- Do not invent new taxonomy values, abbreviate breadcrumb labels, or collapse the hierarchy.
- Example: Ortho Home Defense belongs under Lawn & Garden > Pest & Weed Control > Insect Control.

Source trust rules:
- Highest trust: "shopsite_input" because it reflects the current storefront record.
- High trust: manufacturer and distributor/catalog sources.
- Lower trust: marketplace and retailer listings such as Amazon, Walmart, eBay, and seller-provided labels.
- When sources conflict on brand, category, or product_on_pages, prefer the highest-trust source with direct evidence.
- Never let a marketplace seller label, alias, or "Brand: ..." prefix override higher-trust brand evidence.
- If a source named "shopsite_input" includes product_on_pages, treat those as the current ShopSite assignments and preserve them unless higher-trust source evidence clearly supports a change.

Cohort consistency rules (apply only when sibling product context is provided):
- Use sibling product context as consistency guidance, never as permission to invent unsupported details.
- Keep brand consistent across the product line unless higher-trust evidence for this SKU clearly supports a different brand.
- Reuse the same deepest valid leaf taxonomy pattern used by sibling products when the purchase intent matches.
- Keep naming, differentiators, and description style aligned across sibling products while preserving real variant differences.
- Consistent line example: "Acme Puppy Recipe Dog Food 4 lb.", "Acme Puppy Recipe Dog Food 15 lb.", and "Acme Puppy Recipe Dog Food 30 lb." should share brand, taxonomy pattern, and naming structure while only the supported size changes.
- Consistent line example: "Acme Chicken Recipe Cat Treats 3 oz." and "Acme Salmon Recipe Cat Treats 3 oz." should share brand, taxonomy pattern, and format while flavor changes only when source-supported.

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
- description: 1-2 concise storefront sentences. It must be non-empty.
- long_description: 3-5 concise detail-page sentences. It must be non-empty.
- search_keywords: a comma-separated string of 6-12 concise site-search phrases. Keep it source-supported, avoid duplicate phrases, avoid URLs, and do not stuff the brand repeatedly.
- weight: numeric string only, no units. Preserve source-supported precision up to 2 decimal places. If there is no trustworthy weight, return null.
- category: prefer a single best-fit leaf breadcrumb. Only return multiple category values when the product genuinely belongs in multiple customer-facing aisles, and never include an ancestor plus its child together.

Allowed category values: ${categoryGuidance}
Allowed product_on_pages values: ${pageGuidance}

Return valid JSON only through the response schema. Every required string field must be non-empty.`;
}

/**
 * Build the complete prompt context with taxonomy.
 */
export async function buildPromptContext(): Promise<{
    systemPrompt: string;
    shopsitePages: string[];
}> {
    const categories = await getCategories();

    return {
        systemPrompt: generateSystemPrompt(categories.map((category) => category.breadcrumb)),
        shopsitePages: [...SHOPSITE_PAGES],
    };
}
