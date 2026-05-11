# Progress

## Status
Completed

## Tasks
- [x] Research Supabase migration backfill for missing `products_ingestion` table
- [x] Output research brief to `.research-migration.md`
- [x] Research server-authoritative order pricing in ecommerce checkout flows
- [x] Output research brief to `.research-pricing.md`

## Files Changed
- `apps/web/apps/web/.research-migration.md` — Research document with Supabase migration backfill guidance
- `apps/web/apps/web/.research-pricing.md` — Research document with server-authoritative pricing patterns, Stripe best practices, and implementation guidance

## Notes
- Pricing research covers: item price validation, promo code server-side lifecycle, delivery fee config, tax computation, cart verification pattern, PaymentIntent amount timing, recompute vs verify
- Key recommendation: server recomputes full cart from DB prices; client sends only productId + quantity; PaymentIntent created with verified amount
