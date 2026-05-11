# Bay State Pet & Garden Supply — Web App

A high-performance, mobile-first PWA e-commerce platform. Built with Next.js 16 (App Router), TypeScript, Supabase, and Stripe.

## Requirements

- **Bun 1.3.5** (package manager, enforced by workspace)
- **Docker Desktop** (for local Supabase)
- **Supabase CLI** (`brew install supabase/tap/supabase`)
- **Stripe CLI** (`brew install stripe/stripe-cli/stripe`) — only for card payment testing

## Quick Start (Local Development)

**Prerequisites:**
- Docker Desktop running (for Supabase local containers)
- Stripe CLI installed (for payment testing — optional)

```bash
# 1. Install dependencies
bun install

# 2. Start local Supabase (Docker)
bun run db:start

# 3. Get local Supabase keys
bun run db:status

cp .env.local.example .env.local
# Fill in values from 'bun run db:status' output and Stripe dashboard (test mode)

# 4. Run migrations and seed
bun run db:reset

# 5. Verify seed data
bun run local:verify

# 6. Start dev server
bun run dev        # http://localhost:3000
```

## Local Supabase

The local Supabase stack runs in Docker containers:

| Service     | Port  | URL                           |
|-------------|-------|-------------------------------|
| API (Kong)  | 54321 | http://127.0.0.1:54321        |
| DB (Postgres)| 54322| postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio      | 54323 | http://localhost:54323        |
| Inbucket    | 54324 | http://localhost:54324        |

### Auth Redirect URLs

`supabase/config.toml` is configured for localhost. No additional Supabase dashboard config is needed for local dev. The configured URLs are:

- `http://localhost:3000`
- `http://localhost:3000/**`
- `http://127.0.0.1:3000/**`

### Seed Data

After `bun run db:reset`, the database contains:

- **6 brands**: Fromm, Purina Pro Plan, World's Best Cat Litter, Jonathan Green, Kaytee, KONG
- **8 categories**: Dog Food, Dog Treats & Chews, Dog Toys, Cat Food, Cat Litter, Small Pet Food, Grass Seed, Fertilizer
- **12 products**: Realistic pet and garden products with prices, slugs, and images
- **3 pet types**: Dog, Cat, Small Pet
- **5 facet definitions** with 20 facet values linked to products
- **4 services**: Propane Refill, Knife Sharpening, Curbside Loading, Local Delivery
- **5 site settings**: Campaign banner, homepage, navigation, branding, shopsite migration
- **2 fake orders**: 1 pickup (unpaid), 1 card (paid)

### Important: No Real Credentials

The seed file contains **no real credentials**. Do not add any. If you need a local admin user, create one manually via Supabase Studio (`http://localhost:54323`) or the auth signup flow.

## Stripe Local Workflow

```bash
# 1. Login (one-time)
stripe login

# 2. Start webhook forwarding (in a separate terminal)
bun run stripe:listen
# Output: Your webhook signing secret is whsec_abc123...

# 3. Copy the whsec_... value into .env.local:
#    STRIPE_WEBHOOK_SECRET=whsec_abc123...

# 4. Get test-mode API keys from:
#    https://dashboard.stripe.com/test/apikeys
#    Copy pk_test_... -> NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
#    Copy sk_test_... -> STRIPE_SECRET_KEY

# 5. Restart Next.js dev server
```

### Stripe Test Cards

| Card Number              | Result              |
|--------------------------|---------------------|
| `4242 4242 4242 4242`    | Success             |
| `4000 0000 0000 0002`    | Generic decline     |
| `4000 0025 0000 3155`    | Requires SCA/auth   |

Use any future expiration date, any CVC, any ZIP.

### Stripe Config

| Env Var                       | Source                                          |
|-------------------------------|-------------------------------------------------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → API Keys (test mode)    |
| `STRIPE_SECRET_KEY`           | Stripe Dashboard → API Keys (test mode)         |
| `STRIPE_WEBHOOK_SECRET`       | `stripe listen --forward-to ...` output          |

### Production Stripe Webhook Endpoint

```
https://<your-domain>/api/payments/webhook
```

Configure in Stripe Dashboard → Webhooks. Recommended events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`

### Vercel Environment Variables

| Variable | Source | Preview vs Production |
|----------|--------|----------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → API | Same for all deploys |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → API | Same for all deploys |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → API | Same for all deploys |
| `NEXT_PUBLIC_SITE_URL` | Vercel domain | Preview: auto-set by Vercel |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard | `pk_test_...` for preview, `pk_live_...` for production |
| `STRIPE_SECRET_KEY` | Stripe Dashboard | `sk_test_...` for preview, `sk_live_...` for production |
| `STRIPE_WEBHOOK_SECRET` | Stripe CLI or Dashboard | Different per environment |

Set in Vercel Project → Environment Variables. The app's `vercel.json` at the repo root and `apps/web/vercel.json` both configure `bun install --frozen-lockfile` and `bun run build`.

## Payment Flow

### Pickup (Pay at Store)
1. Customer fills contact info → fulfillment → selects "Pay at Pickup"
2. Order created with `payment_status = 'unpaid'`
3. No Stripe involved
4. Cart cleared after order creation

### Credit Card (Delivery or Card-at-Store)
1. Customer fills contact → fulfillment → selects "Credit Card"
2. Order created with `payment_status = 'unpaid'`
3. Server creates PaymentIntent with amount derived from DB order total
4. Stripe Elements mounts; customer enters card details
5. `stripe.confirmPayment()` with `redirect: 'if_required'`
6. On success, `/api/orders/[id]/payment-complete` verifies PaymentIntent server-side
7. Webhook also catches the event idempotently
8. Cart cleared only after verified payment success

### Expected Behavior

**Success:** PaymentIntent succeeds → webhook delivers `payment_intent.succeeded` → order status updates to `paid` → payment transaction recorded → confirmation page shown.

**Failure:** Failed card → no paid order created → clear error shown → order remains `unpaid` or `failed` → customer can retry.

## Payment Statuses

The DB enum `order_payment_status` defines:

| Status               | Meaning                                      |
|----------------------|----------------------------------------------|
| `unpaid`             | Order created, no payment received            |
| `authorized`         | Payment intent created but not yet confirmed  |
| `paid`               | Payment succeeded                             |
| `failed`             | Payment failed                                |
| `partially_refunded` | Partial refund processed                      |
| `refunded`           | Full refund processed                         |
| `voided`             | Payment voided                                |

## Architecture

| Area            | Location                                       |
|-----------------|------------------------------------------------|
| Pages           | `app/(storefront)/`                            |
| Admin           | `app/admin/`                                   |
| API routes      | `app/api/`                                     |
| Stripe helper   | `lib/payments/stripe.ts`                       |
| Payment intent  | `app/api/payments/intent/route.ts`             |
| Webhook handler | `app/api/payments/webhook/route.ts`            |
| Payment complete| `app/api/orders/[id]/payment-complete/route.ts` |
| Orders          | `lib/orders.ts`                                |
| Checkout UI     | `components/storefront/checkout/`              |
| Payment form    | `components/storefront/payments/payment-form.tsx` |
| Database types  | `lib/supabase/database.types.ts`               |
| Supabase server | `lib/supabase/server.ts`                       |
| DB migrations   | `supabase/migrations/`                         |
| Seed data       | `supabase/seed.sql`                            |

## Tests

```bash
bun run test                  # Full test suite (via custom Jest runner)
bun run test -- --testPathPatterns="app/api/payments"  # Payment route tests
bun run test -- --testPathPatterns="lib/payments"      # Payment lib tests
```

## Environment Variables

See `.env.local.example` for all local dev env vars with explanations.

### Production / Vercel Required Vars

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Scraper/admin/email vars as needed

## Vercel Deployment

The root `vercel.json` configures:
- Bun 1.x runtime
- `bun install --frozen-lockfile`
- `bun run build` (Turbo pipeline)
- `turbo-ignore` for skip conditions

## Troubleshooting

**`supabase start` fails:** Ensure Docker Desktop is running. Check `docker info`.

**`supabase db reset` complains about missing seed.sql:** The seed file must exist at `supabase/seed.sql`. It's referenced in `config.toml`.

**Stripe Elements not loading:** Check that `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set to a valid test key. Card payment is disabled without a valid key.

**Webhook returning 400:** Ensure `STRIPE_WEBHOOK_SECRET` matches what `stripe listen` printed. Restart the dev server after updating.
