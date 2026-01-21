# Pre-orders & Special Deliveries — Generalized, Scalable Features (Issues #79, #84)

## Context

### Original Request
Generalize the requirements from GitHub issues #79 (baby chicks pre-orders with ETA and minimums) and #84 (wood pellet special delivery with delivery fees/services) into broad, scalable features usable for any future pre-orders or special deliveries.

### Interview Summary
**Key Decisions**:
- Pre-orders must support **multiple arrival dates/batches**.
- The minimum rule (e.g., “minimum 6 chicks”) is enforced **across all items in the same arrival batch/date**.
- Cart/checkout may include **multiple arrival batches in one order**.
- Baby chicks are **pickup-only**.
- Special delivery fees are **distance-based**.
- Pre-orders may be **pay at pickup**.
- Mixed carts policy: **one fulfillment method per order**; checkout only offers methods valid for *all* cart items (no auto-splitting).
- Pre-order rules must be scalable beyond “chicks”; do not hardcode category slugs or `is_chick`.
- Pre-order groups/batches must be **admin-configurable via UI**.

**Repository signals**:
- `products.stock_status` already supports `pre_order`, and the storefront already displays a “Pre-Order” badge / “Pre-Order Now” CTA.
- `products.minimum_quantity` exists but is per-product and insufficient for “per arrival date” minimums.
- Orders/checkout are currently pickup-centric and do not persist fulfillment/delivery attributes beyond payment method.
- `addresses` table exists for user address book.

### Metis/Oracle Review (addressed in plan)
- Define a first-class **pre-order batch** model (date, cutoff, optional capacity) rather than only product columns.
- Define how to identify groups for minimum enforcement (via `preorder_group_id`, not “chicks”).
- Persist fee calculations and batch selection on the order for auditability; avoid silent recomputation.
- Define failure modes for distance calculation/geocoding.

---

## Work Objectives

### Core Objective
Add a generalized fulfillment/pre-order system that supports: (1) admin-managed pre-order batches with minimums enforced per batch, and (2) distance-based local delivery for special-delivery items, while keeping one fulfillment method per order.

### Concrete Deliverables
- DB schema to represent pre-order programs/groups, batches, batch selection per order line, and delivery fee details per order.
- Storefront UX updates on PDP/cart/checkout to select a pre-order batch and enforce minimums.
- Checkout support for local delivery when eligible, including distance-based fee computation and order persistence.
- Admin UI to manage pre-order groups/batches and mark products as pickup-only or delivery-eligible.
- Tests covering batch selection, minimum enforcement, and fulfillment gating rules.

### Definition of Done
- [x] Pre-order batch can be created/edited in Admin and appears on relevant PDP.
- [x] Cart enforces minimum quantity across items in same batch.
- [x] Checkout blocks delivery when pickup-only items are present.
- [x] Distance-based delivery fee is calculated, shown, and persisted on order.
- [x] Jest test suite passes (`npm test`).

### Must Have
- Enforce minimum quantities per pre-order batch across grouped items.
- Persist batch selections and delivery fee details to orders.
- Prevent fulfillment-method mixing within one order.

### Must NOT Have (Guardrails)
- Do not implement full carrier shipping (UPS/FedEx/Shippo/EasyPost labels/tracking) unless explicitly expanded.
- Do not auto-split a mixed cart into multiple orders.
- Do not hardcode “chicks” logic in code paths (no `is_chick`, no category-slug coupling).

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (`jest.config.mjs`, `npm test`, extensive `__tests__/`)
- **User wants tests**: YES (tests-after acceptable; aim for TDD where natural)
- **Framework**: Jest + React Testing Library

### Primary Verification Commands
- `npm test`

### Manual Verification (always)
- Run app and verify:
  - PDP: pre-order products show batch selector and messaging.
  - Cart: minimum enforcement triggers clear errors.
  - Checkout: delivery option appears only for eligible carts; fee updates; chicks force pickup.
  - Order confirmation/admin: show batch + fulfillment/delivery details.

---

## Task Flow

Schema & types → Admin management UI → Storefront batch selection → Cart validation → Checkout fulfillment + fee calc → Order persistence & admin display → Tests

---

## TODOs

### 1. Define generalized data model (pre-orders + delivery)

**What to do**:
- Add migrations to introduce:
  - `preorder_groups` (program-level rules: name, min_qty, pickup_only, optional copy)
  - `preorder_batches` (arrival_date, deadline/cutoff, optional capacity)
  - `product_preorder_groups` or `products.preorder_group_id` (attach products to group)
  - `order_items.preorder_batch_id` (capture selected batch per line)
  - Delivery: `orders.fulfillment_method`, `orders.delivery_address_id`, `orders.delivery_distance_miles`, `orders.delivery_fee`, `orders.delivery_services`, `orders.delivery_notes`
- Decide and document whether batch selection lives on `order_items` vs separate `order_item_fulfillment` table.

**Must NOT do**:
- Do not create a full shipping subsystem (carrier integrations).

**Parallelizable**: NO

**References**:
- `supabase/migrations/20251230150000_initial_schema.sql` (products schema + stock_status enum)
- `supabase/migrations/20251231100000_product_shopsite_fields.sql` (minimum_quantity exists)
- `supabase/migrations/20251230160000_orders_schema.sql` (orders base)
- `supabase/migrations/20251230220000_create_orders.sql` (order_items schema)
- `supabase/migrations/20251230210000_create_addresses.sql` (addresses table)

**Acceptance Criteria**:
- [x] New migration(s) exist under `supabase/migrations/` with timestamped names.
- [x] Schema supports: multiple batches per group; multiple batches per order; batch captured per order item.
- [x] Delivery fee + distance fields are stored on `orders`.


### 2. Add server-side “fulfillment rules” utilities

**What to do**:
- Create a dedicated library module (e.g., under `lib/storefront/` or `lib/`) that:
  - Validates cart for pickup-only constraints.
  - Groups cart lines by `preorder_batch_id` and enforces min quantities per batch.
  - Computes delivery fee given origin + destination distance.
  - Defines a stable “fee breakdown” object stored on the order.

**Must NOT do**:
- Do not rely on product names/categories to determine grouping; use `preorder_group_id` and `preorder_batch_id`.

**Parallelizable**: NO (depends on 1)

**References**:
- `lib/cart-store.ts` (cart shape)
- `lib/orders.ts` (order creation)
- `components/storefront/checkout/checkout-client.tsx` (checkout flow)

**Acceptance Criteria**:
- [x] There is a single function that validates the cart for checkout and returns structured errors.
- [x] There is a single function that computes delivery fee (distance-based + service add-ons).


### 3. Extend Admin: manage pre-order groups & batches

**What to do**:
- Add Admin pages to:
  - Create/edit `preorder_groups` (min qty, pickup-only default, display copy).
  - Create/edit `preorder_batches` for a group (arrival date, deadline, optional capacity).
- Add product edit UI to assign a product to a preorder group and to set `pickup_only`.

**Must NOT do**:
- Avoid building complex scheduling UI; basic CRUD is sufficient.

**Parallelizable**: YES (with 4, after 1)

**References**:
- `app/admin/products/[id]/edit/page.tsx` (existing product edit patterns)
- `app/admin/products/[id]/edit/actions.ts` (server action mutation patterns)
- `app/admin/AGENTS.md` (admin conventions)

**Acceptance Criteria**:
- [x] Admin can create a preorder group and add at least 2 batches.
- [x] Admin can attach a product to a preorder group.
- [x] Admin can set product `pickup_only`.


### 4. Storefront PDP: batch selection for pre-order items

**What to do**:
- On product detail page(s), when product is in a preorder group:
  - Show list/select of available batches (arrival dates).
  - Show minimum requirement copy (“Minimum 6 chicks for this arrival date”).
  - Ensure Add to Cart captures selected batch (store it in cart line state).

**Must NOT do**:
- Do not show delivery options for pickup-only products.

**Parallelizable**: YES (with 3, after 1)

**References**:
- `components/storefront/add-to-cart-button.tsx` (pre-order CTA)
- `app/(storefront)/products/[slug]/page.tsx` (stock status display)
- `components/storefront/product-card.tsx` (badges)

**Acceptance Criteria**:
- [x] For pre-order products, a batch must be selected before adding to cart.
- [x] Cart line retains the selected batch.


### 5. Cart: enforce batch minimums and display grouped warnings

**What to do**:
- Group cart items by `preorder_batch_id` (and optionally by preorder group).
- Enforce min quantity per batch across grouped items.
- Show actionable validation messages (which batch is short, how many more needed).

**Parallelizable**: NO (depends on 2 and 4)

**References**:
- `app/(storefront)/cart/page.tsx` (cart UI)
- `lib/cart-store.ts` (cart state)

**Acceptance Criteria**:
- [x] Under-minimum batch prevents proceeding to checkout.
- [x] UI indicates which arrival date needs more quantity.


### 6. Checkout: add local delivery option + distance-based fee

**What to do**:
- Add fulfillment method selection at checkout (pickup vs local delivery), but:
  - If any cart item is pickup-only, only show pickup.
  - If cart has mixed eligibility, only show intersection of allowed methods.
- For local delivery:
  - Collect/select delivery address (use existing addresses table).
  - Compute distance-based fee and show in order summary.
  - Allow optional service add-ons (pallet jack, etc.) if in scope for v1.
- Persist fulfillment method + fee breakdown on order at creation.

**Parallelizable**: NO (depends on 1 and 2)

**References**:
- `components/storefront/checkout/checkout-client.tsx` (currently pickup-only messaging)
- `components/storefront/payments/payment-form.tsx` (payment method selector)
- `app/api/orders/route.ts` (order creation API)
- `lib/orders.ts` (order insert)

**Acceptance Criteria**:
- [x] Delivery option appears only when all items allow it.
- [x] Delivery fee updates when address changes.
- [x] Fee + distance are stored on order and visible in admin/order confirmation.


### 7. Orders/admin/confirmation: show fulfillment + preorder details

**What to do**:
- Extend order confirmation page and email to include:
  - Fulfillment method (pickup vs delivery)
  - Delivery address + fee (if delivery)
  - Pre-order batches/arrival dates per line item
- Extend admin orders view/details to show the above.

**Parallelizable**: YES (after 6)

**References**:
- `app/(storefront)/order-confirmation/[id]/page.tsx` (current pickup-only copy)
- `lib/email/templates/order-confirmation.tsx` (email template)
- `app/admin/orders/page.tsx` (orders list)

**Acceptance Criteria**:
- [x] Customer confirmation clearly communicates pickup-only vs delivery.
- [x] Pre-order arrival dates are visible to customer and staff.


### 8. Tests

**What to do**:
- Add Jest tests for:
  - Minimum enforcement per preorder batch across multiple items.
  - Mixed cart gating: pickup-only item removes delivery option.
  - Order creation persists batch IDs and delivery fee breakdown.

**Parallelizable**: YES (as implementation lands)

**References**:
- `__tests__/components/storefront/product-card.test.tsx` (existing pre-order badge test)
- `__tests__/issues/issue-77-payment-processing.test.ts` (payment-related test style)

**Acceptance Criteria**:
- [x] `npm test` passes.
- [x] New tests cover batch grouping and delivery gating.

---

## Commit Strategy
- Commit per feature slice (schema, admin, storefront, checkout, tests), keeping migrations isolated.

---

## Success Criteria
- Operationally usable for chicks (multiple arrival dates, minimum per date) and pellets (distance-based delivery fee).
- Extensible to future preorder programs without new hardcoded product-type logic.
