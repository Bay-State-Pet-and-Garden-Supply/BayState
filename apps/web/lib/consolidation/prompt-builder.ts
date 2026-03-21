/**
 * Prompt Builder
 *
 * Generates system prompts for product consolidation with taxonomy constraints.
 * Ported and adapted from BayStateTools.
 */

import { createClient } from '@/lib/supabase/server';
import type { Category, ProductType } from './types';

/**
 * Fetch categories from the database.
 */
export async function getCategories(): Promise<Category[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('categories').select('id, name, slug').order('name');

    if (error) {
        console.error('[Consolidation] Failed to fetch categories:', error);
        return [];
    }

    return data || [];
}

/**
 * Fetch product types from the database.
 */
export async function getProductTypes(): Promise<ProductType[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('product_types').select('id, name').order('name');

    if (error) {
        console.error('[Consolidation] Failed to fetch product types:', error);
        return [];
    }

    return data || [];
}

/**
 * Generate the system prompt for product consolidation.
 * Includes taxonomy constraints and formatting rules.
 */
export function generateSystemPrompt(categories: string[], productTypes: string[]): string {
    return `You are an expert e-commerce data analyst for a pet supply and garden products store.
Consolidate product data from multiple scraper sources into a single storefront-ready "Golden Record".

## RULES
1. **NEVER TRUNCATE** words. Never use "..." or abbreviations.
2. **EXACT TAXONOMY** only — use ONLY values from the lists below.
3. **MULTI-SELECT** — select ALL applicable categories and product types.

## TAXONOMY (use exact values only)
Categories: ${categories.join(', ')}
Product Types: ${productTypes.join(', ')}

## INPUT FORMAT
JSON with "sku" and "sources" (dictionary of scraped data from suppliers). Only non-empty fields are included — if a field is missing, it was not available from the source.

## PRODUCT NAME RULES
The "name" field must be a clean, storefront-ready product title:

1. **NO BRAND in name** — Exclude brand from the product name; it goes ONLY in the "brand" field.
   - Brand at start: "Blue Buffalo Dog Food" → name: "Dog Food"
   - Brand in middle: "Dog Food by Blue Buffalo" → name: "Dog Food"
   - Brand at end: "Dog Food Blue Buffalo" → name: "Dog Food"
   - Use case-insensitive matching to strip brand from name.
2. **Structure**: [Product Line/Detail] [Variant/Flavor] [Size/Weight/Count] — size metric always last.
3. **Title Case**: Capitalize each word. Preserve acronyms (e.g., "DNA", "pH").
4. **No special characters**: Remove ™, ®, ©, excessive punctuation. Use "&" not "and" for flavor combos. Commas only where grammatically necessary.
5. **Units (no periods)**: lb, oz, ct, in, ft, gal, L, pk, sq ft
6. **Decimals**: Up to 2 places, trim trailing zeros ("0.70" → "0.7", "1.0" → "1").
7. **Dimensions**: Uppercase "X" with spaces (e.g., "3 X 25 ft").
8. **Pack/Count**: Use "Pack of N" or "N ct" — normalize "(Pack of 1)" away if it adds no info for single items.
9. **Single spaces only**, no trailing periods on units.

## DESCRIPTION RULES
Write 2-3 sentences for an e-commerce product page:
- Focus on what the product IS and its key benefit for the pet/garden owner.
- Use natural, customer-friendly language — not marketing fluff or bullet points.
- Include relevant details (species, life stage, key ingredients) when available in the source data.
- Do NOT copy raw bullet points or "About this item" text verbatim.

## WEIGHT FIELD
- Extract the numeric weight value in the most useful unit (typically lb for heavy items, oz for small).
- Just the number, no unit suffix (e.g., "30" not "30 lb"). Trim trailing zeros.

## FEW-SHOT EXAMPLES

### Example 1: Dog Food
Input:
{"sku":"123456","sources":{"distributor_a":{"title":"BLUE BUFFALO LIFE PROT CHKN/BRN RICE 30LB","brand":"BLUE BUFFALO","weight":"30.00"},"distributor_b":{"title":"Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe","price":"64.99"}}}

Output:
{"name":"Life Protection Formula Adult Chicken & Brown Rice Recipe 30 lb","brand":"Blue Buffalo","weight":"30","description":"Premium dry dog food made with real chicken and brown rice, formulated for adult dogs. Supports healthy muscles, immune system, and a shiny coat.","category":["Dog"],"product_type":["Dry Dog Food"],"confidence_score":0.95}

### Example 2: Cat Treats (Amazon-style scraped data)
Input:
{"sku":"789012","sources":{"amazon":{"title":"Catit Nibbly Grills Cat Treats, Chicken & Shrimp Recipe - Grain-Free Cat Treat 1.06 Ounce (Pack of 1)","brand":"Catit","features":["Tasty grilled strips that look like bacon","Made with up to 85% natural meat","Grain-free and low in carbohydrates"],"dimensions":"7.72 x 4.76 x 0.43 inches","specifications":"Item Weight 1.1 ounces\\nSize 1.06 Ounce (Pack of 1)"}}}

Output:
{"name":"Nibbly Grills Cat Treats Chicken & Shrimp Recipe 1.06 oz","brand":"Catit","weight":"1.06","description":"Grain-free grilled chicken and shrimp cat treats made with up to 85% natural meat. Soft, chewable strips that are easy to digest and low in calories.","category":["Cat"],"product_type":["Cat Treats"],"confidence_score":0.90}

### Example 3: Bird Seed
Input:
{"sku":"345678","sources":{"vendor_x":{"title":"FEATHERED FRIEND BLK OIL SUNFLOWER 20#","weight":"20.000"},"vendor_y":{"title":"Feathered Friend Black Oil Sunflower Seed","description":"Premium wild bird food"}}}

Output:
{"name":"Black Oil Sunflower Seed 20 lb","brand":"Feathered Friend","weight":"20","description":"Premium black oil sunflower seeds for wild birds. High oil content provides energy for all seasons and attracts a wide variety of songbirds.","category":["Wild Bird"],"product_type":["Bird Seed"],"confidence_score":0.90}

## OUTPUT FORMAT
Return valid JSON only — no explanations, no markdown:
{"name":"Product Detail Size","brand":"Brand Name","weight":"30","description":"Storefront description (2-3 sentences).","category":["Category1"],"product_type":["Type1"],"confidence_score":0.85}

## CHECKLIST
- All words complete (no truncation)
- Brand removed from name, placed in brand field
- Category and product_type are EXACT matches from the taxonomy lists
- No special characters (™, ®, ©) in any field
- Size/weight metric appears at the end of the name
- Response is valid JSON only`;
}

/**
 * Build the complete prompt context with taxonomy.
 */
export async function buildPromptContext(): Promise<{
    systemPrompt: string;
    categories: string[];
    productTypes: string[];
}> {
    const [categories, productTypes] = await Promise.all([getCategories(), getProductTypes()]);

    const categoryNames = categories.map((c) => c.name);
    const productTypeNames = productTypes.map((t) => t.name);

    return {
        systemPrompt: generateSystemPrompt(categoryNames, productTypeNames),
        categories: categoryNames,
        productTypes: productTypeNames,
    };
}
