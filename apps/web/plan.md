# Implementation Plan

## Goal
Finish the remaining storefront pass by rendering admin-managed campaign banners, clearing lint/type issues, and validating PDP fulfillment and pet-type data against real product records.

## Tasks
1. **Render the campaign banner from header props**: Use the existing admin-managed campaign banner settings instead of ignoring the prop.
   - File: `components/storefront/header.tsx`
   - Changes: Import `CampaignBanner` from `@/components/storefront/campaign-banner`; destructure `campaignBanner` instead of `_campaignBanner`; render `<CampaignBanner messages={campaignBanner.messages} variant={campaignBanner.variant} cycleInterval={campaignBanner.cycleInterval} />` near the top of the returned fragment when `campaignBanner.enabled` is true and `campaignBanner.messages.length > 0`.
   - Acceptance: `components/storefront/header.tsx` has no unused prop warning, and an enabled banner from `getCampaignBanner()` appears above the desktop/mobile storefront header.

2. **Preserve campaign banner behavior and visual fit**: Confirm the existing banner component works in the new calmer storefront header context.
   - File: `components/storefront/campaign-banner.tsx`
   - Changes: Prefer no logic changes. Only adjust classes if the banner feels visually inconsistent with the softened storefront header; keep dismissal, cycling, previous/next controls, and link behavior intact.
   - Acceptance: Single-message banners render without navigation controls; multi-message banners cycle and can be dismissed; links remain keyboard/mouse accessible.

3. **Confirm layout-to-header data flow**: Verify the storefront layout continues passing admin campaign settings into the header.
   - File: `app/(storefront)/layout.tsx`
   - Changes: No expected code change unless Task 1 changes the prop contract. Keep `campaignBanner={campaignBanner}` on `StorefrontHeader`.
   - Acceptance: `getCampaignBanner()` is called in the layout and its returned settings are passed unchanged to `StorefrontHeader`.

4. **Run targeted lint on changed storefront files**: Clear the current `_campaignBanner` warning and catch any new warnings/errors from the remaining change.
   - File: `components/storefront/header.tsx`, `components/storefront/campaign-banner.tsx`, `app/(storefront)/layout.tsx`, `app/(storefront)/products/[slug]/page.tsx`, `app/(storefront)/page.tsx`, `components/storefront/product-card.tsx`, `components/storefront/footer.tsx`, `lib/storefront/pet-types.ts`
   - Changes: Fix only real lint issues surfaced by the command; do not broad-format unrelated files.
   - Acceptance: Run `bunx eslint app/"(storefront)"/layout.tsx app/"(storefront)"/page.tsx app/"(storefront)"/products/\[slug\]/page.tsx components/storefront/header.tsx components/storefront/campaign-banner.tsx components/storefront/footer.tsx components/storefront/product-card.tsx lib/storefront/pet-types.ts` and get no warnings or errors.

5. **Run full TypeScript verification**: Ensure all changed storefront files compile in the real project context.
   - File: All changed storefront files listed in Task 4.
   - Changes: If TypeScript fails, fix the specific type mismatch in the owning file. Likely areas to watch: `campaignBanner` prop destructuring, `CampaignBannerSettings` shape, `getProductPetTypes()` Supabase relation typing, and PDP `stock_status` casts.
   - Acceptance: Run `bunx tsc --noEmit --pretty false`; no errors should reference the changed storefront files. If unrelated legacy errors appear, record them separately and verify no changed-file errors remain.

6. **Validate PDP pet-type data with real products**: Confirm the new `getProductPetTypes()` helper returns expected pet chips for products that have `product_pet_types` rows.
   - File: `lib/storefront/pet-types.ts`, `app/(storefront)/products/[slug]/page.tsx`
   - Changes: No expected code change unless validation shows the Supabase relation shape is wrong. If needed, update `getProductPetTypes()` to handle the actual returned relation shape without using unsafe assumptions.
   - Acceptance: Identify at least one product with `product_pet_types` data, open its PDP, and verify the above-the-fold “For your” chips and sidebar “Suitable for these pets” chips show the correct names/icons. Also verify a product without pet-type rows hides both sections cleanly.

7. **Validate PDP fulfillment data with real products**: Confirm pickup/delivery, special-order, preorder, stock, quantity, low-stock, minimum quantity, and grouped-size states render correctly from canonical product data.
   - File: `app/(storefront)/products/[slug]/page.tsx`, `components/storefront/add-to-cart-button.tsx`
   - Changes: No expected code change unless real data exposes a mismatch. If needed, adjust PDP copy/conditions while preserving `AddToCartButton`’s accepted stock statuses: `in_stock | out_of_stock | pre_order`.
   - Acceptance: Check sample PDPs for: normal local delivery item, `pickup_only` item from `product_storefront_settings`, `is_special_order` item, `out_of_stock` item, `pre_order` item, low-stock item with quantity/threshold, and grouped product with size selector.

8. **Browser sanity pass for adjacent storefront surfaces**: Confirm the header/banner and PDP changes do not break mobile or desktop storefront navigation.
   - File: `components/storefront/header.tsx`, `components/storefront/campaign-banner.tsx`, `app/(storefront)/products/[slug]/page.tsx`, `components/storefront/product-card.tsx`, `app/(storefront)/page.tsx`
   - Changes: Fix only regressions observed during QA.
   - Acceptance: In desktop and mobile viewport widths, verify homepage, product listing/card, and a PDP load; header nav/search/cart/favorites still work; campaign banner displays/dismisses; no obvious overlap with sticky header/mobile header.

## Files to Modify
- `components/storefront/header.tsx` - replace the unused `_campaignBanner` prop with active `campaignBanner` rendering.
- `components/storefront/campaign-banner.tsx` - only if minor styling/class adjustments are needed for the calmer header context.
- `app/(storefront)/products/[slug]/page.tsx` - only if real-data validation reveals fulfillment or pet-type rendering issues.
- `lib/storefront/pet-types.ts` - only if Supabase relation typing/shape needs correction after validation.

## New Files
- None expected.

## Dependencies
- Task 1 must happen before Tasks 4 and 5 can pass cleanly.
- Task 2 depends on Task 1 rendering the banner in the header.
- Task 3 is a quick verification after Task 1, unless the prop contract changes.
- Tasks 6 and 7 depend on TypeScript being clean enough to run the storefront locally.
- Task 8 should run after Tasks 1–7 are complete.

## Risks
- `CampaignBanner` is a client component and `StorefrontHeader` is already a client component, so rendering is compatible, but its dismiss state will reset on full page reloads.
- The current `_campaignBanner` destructure likely creates both ESLint and possible TypeScript issues because the typed prop is named `campaignBanner`.
- `CampaignBanner` variant classes currently map all variants to the same primary styling; this is acceptable for functionality but may need visual tuning if it clashes with the softened header.
- `getProductPetTypes()` uses Supabase nested relation output that may differ by generated type inference; validate against real returned data before assuming the current normalization is enough.
- PDP `StockBadge` supports a `low_stock` string even though the shared `Product` type currently lists only `in_stock | out_of_stock | pre_order`; keep `AddToCartButton` casts constrained to its accepted stock statuses.
- Real-data validation depends on having representative products for pickup-only, special-order, preorder, low-stock, grouped sizes, and pet-type relationships; if fixtures are missing, document which states could not be verified.