# Bay State Pet & Garden Supply — Web App

A high-performance, mobile-first PWA e-commerce platform. Built with Next.js 16 (App Router), TypeScript, Supabase, and Stripe.

## Requirements

- **Bun 1.3.5** (package manager, enforced by workspace)
- **Stripe CLI** (`brew install stripe/stripe-cli/stripe`) — only for card payment testing

## Quick Start (Development)

```bash
# 1. Install dependencies
bun install

# 2. Set up environment
cp .env.local.example .env.local
# Fill in your Supabase keys from: https://supabase.com/dashboard/project/fapnuczapctelxxmrail/settings/api
# You need: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY

# 3. Start dev server
bun run dev        # http://localhost:3000
```

Dev connects directly to the live Supabase project (`fapnuczapctelxxmrail`). There is no local Docker-based Supabase — the same database powers local dev, Vercel preview, and production.

## Supabase

The app connects to the live Supabase project at `https://fapnuczapctelxxmrail.supabase.co`.

### Schema Changes (Migrations)

Migrations live in `supabase/migrations/`. To apply them to the live database:

```bash
bun run db:push
```

This runs `supabase db push` against the linked project.

### Auth Redirect URLs

Configured in the Supabase Dashboard at:
https://supabase.com/dashboard/project/fapnuczapctelxxmrail/auth/url-configuration

Redirect URLs should include:
- `http://localhost:3000/**`
- `https://bay-state-app.vercel.app/**`

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
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project → API | Same for all deploys |
| `SUPABASE_SECRET_KEY` | Supabase project → API | Same for all deploys |
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

## Tests

```bash
bun run test                  # Full test suite (via custom Jest runner)
bun run test -- --testPathPatterns="app/api/payments"  # Payment route tests
bun run test -- --testPathPatterns="lib/payments"      # Payment lib tests
```

## Environment Variables

See `.env.local.example` for all dev env vars with explanations. The critical Supabase vars are:

- `NEXT_PUBLIC_SUPABASE_URL=https://fapnuczapctelxxmrail.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` (from Supabase Dashboard)
- `SUPABASE_SECRET_KEY=sb_secret_...` (from Supabase Dashboard — secret key)

## Vercel Deployment

The root `vercel.json` configures:
- Bun 1.x runtime
- `bun install --frozen-lockfile`
- `bun run build` (Turbo pipeline)
- `turbo-ignore` for skip conditions

## Troubleshooting

**"Supabase configuration missing" error:** Ensure `.env.local` has valid `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase Dashboard.

**Auth redirects not working locally:** Check that `http://localhost:3000/**` is in the Supabase Dashboard redirect URL list.

**Stripe Elements not loading:** Check that `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set to a valid test key. Card payment is disabled without a valid key.

**Webhook returning 400:** Ensure `STRIPE_WEBHOOK_SECRET` matches what `stripe listen` printed. Restart the dev server after updating.
