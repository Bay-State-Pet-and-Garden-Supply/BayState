# BayState Mobile

Expo Router mobile app for BayState storefront APIs.

## Setup

1. Copy `.env.example` to `.env` and set values:
   - `EXPO_PUBLIC_API_BASE_URL` (Next.js web app base URL)
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
2. Install dependencies from repo root:

```bash
bun install
```

3. Start web app and mobile app:

```bash
bun run web dev
bun run mobile dev
```

## Current MVP Coverage

- Product catalog list and detail via `mobileV1.catalog.*`
- Checkout quote + order creation via `mobileV1.checkout.*`
- Auth + account profile/orders via `mobileV1.account.*`

Stripe PaymentSheet integration is scaffolded at the API layer and can be wired into UI flows next.
