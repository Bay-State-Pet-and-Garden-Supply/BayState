/**
 * Prompt Builder
 *
 * Generates system prompts for product consolidation with taxonomy constraints.
 * Ported and adapted from BayStateTools.
 */

import { SHOPSITE_PAGES } from '@/lib/shopsite/constants';
import {
    normalizeCategoryOptions,
} from '@/lib/facets/normalization';
import type { Category } from './types';

/**
 * Fetch categories from the database.
 */
export async function getCategories(): Promise<Category[]> {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();
    const { data, error } = await supabase.from('categories').select('id, name, slug').order('name');

    if (error) {
        console.error('[Consolidation] Failed to fetch categories:', error);
        return [];
    }

    return normalizeCategoryOptions(data || []);
}

/**
 * Generate the system prompt for product consolidation.
 * Includes taxonomy constraints and formatting rules.
 */
export function generateSystemPrompt(categories: string[]): string {
    const categoryGuidance =
        categories.length > 0
            ? categories.join(', ')
            : 'No category values were provided.';
    const pageGuidance = SHOPSITE_PAGES.join(', ');

    return `You consolidate multi-source product data into one storefront-ready canonical record.

Use only values allowed by the response schema for category and product_on_pages.

Source trust rules:
- Highest trust: "shopsite_input" because it reflects the current storefront record.
- High trust: manufacturer and distributor/catalog sources.
- Lower trust: marketplace and retailer listings such as Amazon, Walmart, eBay, and seller-provided labels.
- When sources conflict on brand, category, or product_on_pages, prefer the highest-trust source with direct evidence.
- Never let a marketplace seller label, alias, or "Brand: ..." prefix override higher-trust brand evidence.
- If a source named "shopsite_input" includes product_on_pages, treat those as the current ShopSite assignments and preserve them unless higher-trust source evidence clearly supports a change.

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
        systemPrompt: generateSystemPrompt(categories.map((c) => c.name)),
        shopsitePages: [...SHOPSITE_PAGES],
    };
}
