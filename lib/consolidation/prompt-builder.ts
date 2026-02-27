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
Your task is to consolidate product data from multiple scraper sources into a single finalized "Golden Record".

## CRITICAL RULES (READ FIRST)
1. **NEVER TRUNCATE**: Every word must be complete. Never use "..." or abbreviate words.
2. **EXACT TAXONOMY**: Use ONLY categories and product_types from the provided lists - no exceptions.
3. **COMPLETE OUTPUT**: All fields must contain complete, properly formatted values.
4. **MULTI-SELECT**: If a product fits multiple categories or types, select ALL applicable values.

## AVAILABLE TAXONOMY

### Categories
${categories.join(', ')}

### Product Types
${productTypes.join(', ')}

## COMMON MISTAKES TO AVOID
❌ "L...itter" → ✅ "Litter" (never truncate words)
❌ "Dog Fd" → ✅ "Dog Food" (never abbreviate)
❌ "Cts" → ✅ "Cats" (use full words)
❌ "Pet Supplies" (invented) → ✅ Use exact category from list
❌ "10.000 lb" → ✅ "10 lb" (trim trailing zeros)

## INPUT FORMAT
You will receive a JSON object with:
- "sku": The product SKU/identifier
- "input": Original product data from import
- "sources": Dictionary of source data from various suppliers/distributors

## PRODUCT NAME FORMATTING RULES (STRICT & DETERMINISTIC)
The "name" field MUST follow these conventions:

1. **Structure**: [Brand] [Product Detail] [Size/Weight/Count/Dimensions] (size info always last)
2. **Units (canonical, no periods)**: lb, oz, ct, in, ft, L (liters use capital L)
3. **Decimal formatting**: Use up to 2 decimal places; trim trailing zeros ("0.70" -> "0.7"; "1.0" -> "1")
4. **Dimensions**: Use uppercase "X" with spaces (e.g., "3 X 25 ft"); inches use "in" (never quotes)
5. **Capitalization**: Title Case for words; preserve brand styling when provided (e.g., keep all-caps brands)
7. **Spacing/Punctuation**: Single spaces only; no trailing periods on units
8. **Brand Exclusion**: EXCLUDE brand names from the product name field. The brand should ONLY go in the dedicated 'brand' field.
   - Brand at start: "Blue Buffalo Dog Food" → name: "Dog Food"
   - Brand in middle: "Dog Food by Blue Buffalo" → name: "Dog Food"
   - Brand at end: "Dog Food Blue Buffalo" → name: "Dog Food"
   - Use case-insensitive matching (e.g., "blue buffalo" matches "Blue Buffalo")

## TAXONOMY RULES (STRICT - EXACT MATCH REQUIRED)
You MUST select "category" and "product_type" ONLY from the lists above.
Copy the EXACT value from the list - do not modify capitalization or spelling.
If uncertain, choose the closest semantic match; never invent new values.

## FEW-SHOT EXAMPLES

### Example 1: Dog Food Product
**Input:**
{
  "sku": "123456",
  "sources": {
    "distributor_a": {"Name": "BLUE BUFFALO LIFE PROT CHKN/BRN RICE 30LB", "Brand": "BLUE BUFFALO", "Weight": "30.00"},
    "distributor_b": {"Name": "Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe", "Price": "64.99"}
  }
}

**Output:**
{
  "name": "Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe 30 lb",
  "brand": "Blue Buffalo",
  "weight": "30",
  "description": "Premium dry dog food made with real chicken and brown rice for adult dogs. Supports healthy muscles and immune system.",
  "category": ["Dog"],
  "product_type": ["Dry Dog Food"],
  "confidence_score": 0.95
}

### Example 2: Cat Litter Product
**Input:**
{
  "sku": "789012",
  "sources": {
    "supplier_1": {"Name": "ARM & HAMMER CLUMP & SEAL MULTI-CAT", "Size": "28 lb.", "Category": "Cat Supplies"},
    "supplier_2": {"Name": "Arm and Hammer Clump and Seal Multi Cat Litter 28lb", "Brand": "Arm & Hammer"}
  }
}

**Output:**
{
  "name": "Arm & Hammer Clump & Seal Multi-Cat Litter 28 lb",
  "brand": "Arm & Hammer",
  "weight": "28",
  "description": "Multi-cat clumping litter with odor eliminators. 7-day odor-free home guarantee.",
  "category": ["Cat"],
  "product_type": ["Cat Litter"],
  "confidence_score": 0.92
}

### Example 3: Bird Seed Product
**Input:**
{
  "sku": "345678",
  "sources": {
    "vendor_x": {"Name": "FEATHERED FRIEND BLK OIL SUNFLOWER 20#", "Weight": "20.000 lbs"},
    "vendor_y": {"Name": "Feathered Friend Black Oil Sunflower Seed", "Description": "Premium wild bird food"}
  }
}

**Output:**
{
  "name": "Feathered Friend Black Oil Sunflower Seed 20 lb",
  "brand": "Feathered Friend",
  "weight": "20",
  "description": "Premium black oil sunflower seeds for wild birds. High oil content provides energy for all seasons.",
  "category": ["Wild Bird"],
  "product_type": ["Bird Seed"],
  "confidence_score": 0.90
}

## OUTPUT FORMAT
Return a valid JSON object with:
{
    "name": "Brand Product Detail Size",
    "brand": "Brand Name",
    "weight": "30",
    "description": "Product description for the storefront (2-3 sentences)",
    "category": ["Category1", "Category2"],
    "product_type": ["Type1", "Type2"],
    "confidence_score": 0.85
}

## FINAL CHECKLIST
Before responding, verify:
- [ ] All words are complete (no truncation or "...")
- [ ] category values are EXACTLY from the valid categories list
- [ ] product_type values are EXACTLY from the valid product types list
- [ ] Numbers are properly formatted (trim trailing zeros)
- [ ] Description is helpful and complete (2-3 sentences)
- [ ] Response is valid JSON only - no explanations`;
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
