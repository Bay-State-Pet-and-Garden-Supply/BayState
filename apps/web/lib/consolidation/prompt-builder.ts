/**
 * Prompt Builder
 *
 * Generates system prompts for product consolidation with taxonomy constraints.
 * Ported and adapted from BayStateTools.
 */

import { SHOPSITE_PAGES } from '@/lib/shopsite/constants';
import {
    normalizeCategoryOptions,
    normalizeProductTypeOptions,
} from '@/lib/facets/normalization';
import type { Category, ProductType } from './types';

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
 * Fetch product types from the database.
 */
export async function getProductTypes(): Promise<ProductType[]> {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();
    const { data, error } = await supabase.from('product_types').select('id, name').order('name');

    if (error) {
        console.error('[Consolidation] Failed to fetch product types:', error);
        return [];
    }

    return normalizeProductTypeOptions(data || []);
}

/**
 * Generate the system prompt for product consolidation.
 * Includes taxonomy constraints and formatting rules.
 */
export function generateSystemPrompt(categories: string[], productTypes: string[]): string {
    void categories;
    void productTypes;

    return `You consolidate multi-source product data into one storefront-ready canonical record.

Use only values allowed by the response schema for category, product_type, and product_on_pages.
If a source named "shopsite_input" includes product_on_pages, treat those as the current ShopSite assignments and preserve them unless the other source evidence clearly supports adding or removing a page.

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
- For decimal size, weight, or count values, keep only the leading whole-number portion and do not round: 1.06 oz. → 1 oz., 7.9 lb. → 7 lb., 2.5 gal. → 2 gal.
- Use uppercase X with spaces for dimensions, for example 3 X 25 ft. or 11 X 17 in.

Field rules:
- description: 1-2 concise storefront sentences.
- long_description: 3-5 concise detail-page sentences.
- weight: numeric string only, no units. If there is no weight, return null.
- Return valid JSON only through the response schema.`;
}

/**
 * Build the complete prompt context with taxonomy.
 */
export async function buildPromptContext(): Promise<{
    systemPrompt: string;
    categories: string[];
    productTypes: string[];
    shopsitePages: string[];
}> {
    const [categories, productTypes] = await Promise.all([getCategories(), getProductTypes()]);

    const categoryNames = categories.map((c) => c.name);
    const productTypeNames = productTypes.map((t) => t.name);

    return {
        systemPrompt: generateSystemPrompt(categoryNames, productTypeNames),
        categories: categoryNames,
        productTypes: productTypeNames,
        shopsitePages: [...SHOPSITE_PAGES],
    };
}
