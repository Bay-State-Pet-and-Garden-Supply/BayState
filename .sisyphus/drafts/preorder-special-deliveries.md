# Draft: Pre-orders & Special Deliveries (Issues #84, #79)

## Requirements (confirmed)
- Generalize work from issues #84 and #79 into scalable, reusable features supporting any pre-order or special delivery scenario.
- Must support at least:
  - Pre-order products with ETA-style messaging and quantity rules (Issue #79: baby chicks).
  - Special delivery / local delivery for bulky items with zip/zone validation and optional services/fees (Issue #84: wood pellets).
- Pre-orders must support **multiple arrival dates/batches** (user-confirmed).
- Baby chicks minimum is **across all chicks per arrival date** (user-confirmed).
- Cart/checkout must allow **multiple arrival dates in one order** (user-confirmed).
- Baby chicks are **pickup-only** (user-confirmed).
- Wood pellet/special delivery fees should be **distance-based** (user-confirmed).
- Pre-orders may use **pay at pickup** (user-confirmed).
- Pre-order grouping/minimum rules must be scalable beyond chicks (user-confirmed).
- Pre-order groups/batches should be **admin-configurable via UI** (user-confirmed).

## Technical Decisions
- Candidate direction: model as **Fulfillment Rules / Fulfillment Method** abstractions that apply consistently across PDP → cart → checkout → order record → admin.
- Open: whether rules live as product-level columns vs normalized tables (e.g., `delivery_zones`, `fulfillment_methods`, `product_fulfillment_rules`) vs hybrid.
- Mixed carts (proposed default, user delegated):
  - Keep **one fulfillment method per order** (e.g., pickup OR local delivery).
  - Only offer fulfillment methods valid for **all** cart items (intersection).
  - Pre-order items can coexist with in-stock items if fulfillment method remains compatible; readiness/ETA is handled per item/batch.
- Pre-order batch modeling:
  - Model “arrival dates” as a first-class entity (e.g., `preorder_batches`) associated to products and selectable in cart/checkout.
  - Enforce minimum quantity **per batch** across all chick items assigned to that batch.
- Fulfillment gating:
  - If any cart line is pickup-only (e.g., chicks), fulfillment method set is restricted to pickup.
- Product restriction modeling (user-confirmed scope):
  - For now, we only need **pickup-only** restriction.
  - Use a narrowly-scoped column for v1 (e.g., `products.pickup_only boolean`) with a clear migration path to a generalized allowed-methods model later.
- Pre-order modeling (scalable):
  - Reuse `products.stock_status = 'pre_order'` (already exists) as the high-level pre-order signal.
  - Add `products.preorder_group_id` (FK) to attach a product to a reusable pre-order program/group.
  - Create admin-managed `preorder_groups` and `preorder_batches` to support multiple arrival dates and per-batch minimum enforcement.

## Research Findings
- Issue #79: “Implement Baby Chicks Pre-Order System with ETA”
  - As written, proposes product-level fields like `eta_date`, `pre_order_minimum`, `pre_order_maximum`, `pre_order_deadline`, plus PDP/cart/admin/notifications.
  - Note: reference mentions “Minimum 6 chicks per arrival date” which may imply **multiple arrival batches/dates**, not just one ETA.
- Issue #84: “Build Wood Pellet Special Delivery System”
  - Local delivery across SE New England, minimum 1 ton, pallet options, zip-based delivery fees, optional pallet jack service (+$25), special handling (flatbed/forklift).
- Related Issue #78 (broader): shipping calculator + delivery options + zones + carrier integration.

### Current Codebase Signals
- Product model already supports `stock_status` including `pre_order`.
  - UI already displays “Pre-Order” badge and “Pre-Order Now” CTA.
- Product model already has `minimum_quantity` (defaults to 1).
- Orders are effectively pickup-only today:
  - Checkout collects contact info + payment method (`pickup`, `credit_card`, `paypal`).
  - `orders` table lacks shipping/delivery fields (no address/zone/delivery method/fees).
- Addresses table exists and is used for user address book (not currently used in checkout/order).

### External Research (high-level)
- Pre-order best practices emphasize:
  - Capturing promised/estimated availability dates (often per line/batch)
  - Clear customer messaging about delays/ETAs
  - Rules around payments (pay now vs deposit vs pay later) and cancellations
- Distance-based local delivery pricing commonly uses a store origin + driving-distance calculation (often via a distance matrix API) and computes a fee as:
  - base fee + (distance * rate) + optional service add-ons, with min/max guards

### Metis/Oracle Gap Analysis (to incorporate into plan)
- CRITICAL decisions/clarifications to bake in:
  - Source of truth for pre-order batches (admin-managed vs imported) and whether batches have caps.
  - How “chicks” are identified for minimum enforcement (tag/category/flag) to avoid coupling to product names.
  - Delivery fee distance metric (driving vs straight-line) and fallback behavior when geocoding fails.
  - Persist delivery fee and batch selection on order for auditability (no silent recomputation).
- Edge cases to cover:
  - Same SKU in multiple batches (must treat separately in cart/order).
  - Batch date changes after order placement (define behavior; likely keep original on existing orders).
  - Mixed carts with pickup-only items disable delivery methods with clear explanation.

## Open Questions
- Pre-order semantics:
  - Is pre-order represented solely by `products.stock_status = 'pre_order'` (preferred reuse) or do you want a separate `is_pre_order` flag?
  - Do baby chicks require **multiple arrival dates/batches** (each with its own min qty/deadline), or is a single product-level ETA sufficient for v1?
  - For the “Minimum 6 chicks per arrival date” rule: is the minimum enforced **across all chick items sharing the same arrival date** (mix breeds to reach 6), or **per product/breed**?
  - Can a single cart include **multiple arrival dates**? If yes, should the minimum apply **per arrival date** (likely) and can the customer check out in one order?
  - Should pre-orders be payable now (credit card/paypal) vs “pay at pickup” allowed?
- Special delivery semantics:
  - Do you want **local delivery only** for now, or also plan for carrier shipping (UPS/FedEx/Shippo/EasyPost) as part of the same generalized system?
  - Are special services (pallet jack, lift gate, forklift) customer-selectable at checkout, admin-set after order, or a mix?
- Mixed-cart rules:
  - Can an order include items with different fulfillment needs (pickup + local delivery + pre-order)? If yes, should checkout split into multiple orders or disallow mixing?
- Data model placement:
  - Do we store delivery method/fees/ETA on the **order** for auditability (recommended), even if derived from product rules?
- Surfaces:
  - Must-have touchpoints: PDP, cart, checkout, order confirmation email, admin order detail, admin product edit.
- Test strategy:
  - Repo uses Jest + RTL and Playwright for a11y—should this effort be TDD, tests-after, or manual-only?

## Scope Boundaries
- INCLUDE (candidate): generalized fulfillment rules, enforcement in cart/checkout, persistence on orders, minimal admin + storefront UI.
- EXCLUDE (candidate): full carrier label generation/tracking (unless you want #78 folded in), and Twilio SMS work (Issue #83) unless explicitly requested.
