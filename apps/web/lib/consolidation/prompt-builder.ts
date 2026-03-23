/**
 * Prompt Builder
 *
 * Generates system prompts for product consolidation with taxonomy constraints.
 * Ported and adapted from BayStateTools.
 */

import { SHOPSITE_PAGES } from '@/lib/shopsite/constants';
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

    return data || [];
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

    return data || [];
}

/**
 * Generate the system prompt for product consolidation.
 * Includes taxonomy constraints and formatting rules.
 */
export function generateSystemPrompt(categories: string[], productTypes: string[]): string {
    const pagesList = SHOPSITE_PAGES.join(', ');

    return `You are an expert e-commerce data analyst for a pet supply and garden products store.
Consolidate product data from multiple scraper sources into a single storefront-ready "Golden Record".

## RULES
1. **NEVER TRUNCATE** words. Never use "..." or abbreviations.
2. **EXACT TAXONOMY** only — use ONLY values from the lists below.
3. **MULTI-SELECT** — select ALL applicable categories and product types.

## TAXONOMY (use exact values only)
Categories: ${categories.join(', ')}
Product Types: ${productTypes.join(', ')}

## STORE PAGES (use exact values only)
${pagesList}

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
5. **Units with periods**: lb., oz., ct., in., ft., gal., qt., pt., pk., sq. ft. — always include a period after unit abbreviations.
6. **Expand abbreviations**: Sm→Small, Md→Medium, Lg→Large, Blk/Blck→Black, Wht→White, Brn→Brown, Grn→Green, Rd→Red, Bl→Blue, Yl→Yellow, Org→Orange, Pnk→Pink, Prpl→Purple, Gry→Gray, Asst/Asstd→Assorted, Med→Medium, Lrg→Large, Sml→Small.
7. **Decimals**: Up to 2 places, trim trailing zeros ("0.70" → "0.7", "1.0" → "1").
8. **Dimensions**: Uppercase "X" with spaces (e.g., "3 X 25 ft.").
9. **Pack/Count**: Use "Pack of N" or "N ct." — normalize "(Pack of 1)" away if it adds no info for single items.
10. **Single spaces only**, no trailing whitespace.

## DESCRIPTION RULES (short description)
Write 1-2 concise sentences for a category/listing page:
- Focus on what the product IS and its primary use.
- Customer-friendly language — not marketing fluff.
- Do NOT copy raw bullet points or "About this item" text verbatim.
- Do NOT just repeat the product name.

## LONG DESCRIPTION RULES (detail page)
Write 3-5 sentences for the product detail page:
- Expand on features, benefits, ingredients, usage instructions.
- Include species/life stage, key ingredients, materials when available.
- Natural paragraph form — no bullet points or HTML.
- Provide genuinely useful information a shopper needs to make a purchase decision.

## SEARCH KEYWORDS
Provide 5-15 comma-separated search terms:
- Include common synonyms, misspellings, related terms.
- Include species names, use cases, ingredient highlights.
- All lowercase, no duplicates.
- Example: "dog food, dry kibble, adult dog, chicken recipe, brown rice, high protein"

## PRODUCT ON PAGES
Select which store pages this product should appear on from the STORE PAGES list above.
- Choose ALL applicable pages based on the product's category and use.
- Most products belong on 1-3 pages.
- Only use exact page names from the list.

## WEIGHT FIELD
- Extract the numeric weight value in the most useful unit (typically lb for heavy items, oz for small).
- Just the number, no unit suffix (e.g., "30" not "30 lb"). Trim trailing zeros.

## FEW-SHOT EXAMPLES

### Example 1: Dog Food
Input:
{"sku":"123456","sources":{"distributor_a":{"title":"BLUE BUFFALO LIFE PROT CHKN/BRN RICE 30LB","brand":"BLUE BUFFALO","weight":"30.00"},"distributor_b":{"title":"Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe","price":"64.99"}}}

Output:
{"name":"Life Protection Formula Adult Chicken & Brown Rice Recipe 30 lb.","brand":"Blue Buffalo","weight":"30","description":"Premium dry dog food made with real chicken and brown rice for adult dogs. Supports healthy muscles and immune system.","long_description":"Life Protection Formula Adult Chicken & Brown Rice Recipe is a premium dry dog food formulated with real deboned chicken as the first ingredient. Enhanced with vitamins, minerals, and antioxidant-rich LifeSource Bits to support immune health, strong muscles, and a shiny coat. Brown rice provides wholesome grains for sustained energy, while omega fatty acids promote healthy skin. Ideal for adult dogs of all breeds.","search_keywords":"dog food, dry kibble, adult dog, chicken recipe, brown rice, life protection, high protein, immune support, healthy coat","product_on_pages":["Dog Food"],"category":["Dog"],"product_type":["Dry Dog Food"],"confidence_score":0.95}

### Example 2: Cat Treats
Input:
{"sku":"789012","sources":{"amazon":{"title":"Catit Nibbly Grills Cat Treats, Chicken & Shrimp Recipe - Grain-Free Cat Treat 1.06 Ounce (Pack of 1)","brand":"Catit","features":["Tasty grilled strips that look like bacon","Made with up to 85% natural meat","Grain-free and low in carbohydrates"],"dimensions":"7.72 x 4.76 x 0.43 inches","specifications":"Item Weight 1.1 ounces\\nSize 1.06 Ounce (Pack of 1)"}}}

Output:
{"name":"Nibbly Grills Cat Treats Chicken & Shrimp Recipe 1.06 oz.","brand":"Catit","weight":"1.06","description":"Grain-free grilled chicken and shrimp cat treats made with up to 85% natural meat. Soft strips that are easy to digest.","long_description":"Nibbly Grills Chicken & Shrimp Recipe are grain-free cat treats crafted with up to 85% real meat for an irresistible taste cats love. The soft, grilled strips resemble bacon and provide a satisfying chewy texture. Low in carbohydrates and free from artificial preservatives, these treats are a healthy reward for cats of all ages. Perfect for training, bonding, or as an everyday snack between meals.","search_keywords":"cat treats, grain free, chicken shrimp, grilled strips, natural meat, low carb, chewy treats, cat snacks","product_on_pages":["Cat Food"],"category":["Cat"],"product_type":["Cat Treats"],"confidence_score":0.90}

### Example 3: Bird Seed
Input:
{"sku":"345678","sources":{"vendor_x":{"title":"FEATHERED FRIEND BLK OIL SUNFLOWER 20#","weight":"20.000"},"vendor_y":{"title":"Feathered Friend Black Oil Sunflower Seed","description":"Premium wild bird food"}}}

Output:
{"name":"Black Oil Sunflower Seed 20 lb.","brand":"Feathered Friend","weight":"20","description":"Premium black oil sunflower seeds for wild birds. High oil content provides energy for all seasons.","long_description":"Black Oil Sunflower Seed is a premium wild bird food that attracts a wide variety of songbirds including cardinals, finches, chickadees, and nuthatches. The thin shells are easy for small birds to crack, while the high oil content provides essential energy throughout all seasons. This 20 lb. bag is ideal for filling tube feeders, hopper feeders, and platform feeders. A versatile seed that serves as the foundation of any backyard bird feeding program.","search_keywords":"bird seed, sunflower seed, black oil, wild bird food, songbird, cardinal, finch, bird feeder, backyard birds","product_on_pages":["Bird Supplies"],"category":["Wild Bird"],"product_type":["Bird Seed"],"confidence_score":0.90}

## OUTPUT FORMAT
Return valid JSON only — no explanations, no markdown:
{"name":"Product Detail Size","brand":"Brand Name","weight":"30","description":"Short description (1-2 sentences).","long_description":"Detailed description (3-5 sentences).","search_keywords":"keyword1, keyword2, keyword3","product_on_pages":["Page1","Page2"],"category":["Category1"],"product_type":["Type1"],"confidence_score":0.85}

## CHECKLIST
- All words complete (no truncation)
- Abbreviations expanded (Sm→Small, Blk→Black, etc.)
- Units have periods (lb., oz., ct., ft., in.)
- Brand removed from name, placed in brand field
- Category and product_type are EXACT matches from the taxonomy lists
- product_on_pages uses EXACT page names from the store pages list
- No special characters (™, ®, ©) in any field
- Size/weight metric appears at the end of the name
- description is 1-2 sentences (short, for listing pages)
- long_description is 3-5 sentences (detailed, for product detail page)
- search_keywords are lowercase, comma-separated, relevant
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
