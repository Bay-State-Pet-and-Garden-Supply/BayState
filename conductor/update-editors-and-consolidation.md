# Plan: Simplify Editors and Consolidation to Core ShopSite Fields

The goal is to focus ONLY on the core ShopSite fields required for the pipeline. AI consolidation will handle identity and categorization, while humans will decide operational flags like "Special Order". Descriptions are no longer needed as ShopSite uses the name.

## Core Fields for AI Consolidation
- Name
- Brand
- Price
- Weight
- Category
- Product Type
- Product on Pages

## Manual Fields (Finalizing/Published Editors)
- Special Order (decided by human)
- Images (selected by human)
- All the above AI fields (for verification/correction)

## Proposed Changes

### 1. Update Schemas
Update `ConsolidatedDataSchema` and `PipelineProductConsolidatedSchema`:
- Remove `description`.
- Ensure `is_special_order` is in the schema (for human persistence).

### 2. Update AI Prompt
- Remove `description` from the output format and instructions.
- Update few-shot examples to remove the `description` field.
- Explicitly state that descriptions are not needed.

### 3. Update Editors (`PipelineProductDetail.tsx` & `ProductEditModal.tsx`)
- Remove the `Description` text area.
- Add the `Special Order` checkbox back (as it's a human decision).
- Keep the simplified layout.

### 4. Update Publishing & Export
- Update `publishToStorefront` in `publish.ts`:
  - Set `description` column in `products` table to the `name`.
  - Ensure `is_special_order` is correctly synced.
- Update `xml-generator.ts`:
  - Use `product.name` for the `ProductDescription` XML tag if no description is provided.
  - Ensure all core fields are exported correctly.

## Verification Plan
- Verify AI consolidation doesn't produce descriptions.
- Verify editors show "Special Order" and no "Description".
- Verify published products have their name as their description.
- Verify ShopSite XML uses Name for the description field.
