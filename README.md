# BayState Monorepo

This is the monorepo for Bay State Pet and Garden Supply, containing the web application and scraper engine.

## Structure

```
BayState/
├── apps/
│   ├── web/              # Next.js 16 + TypeScript + Bun (formerly BayStateApp)
│   └── scraper/          # Python + Docker + Playwright (formerly BayStateScraper)
├── package.json          # Root workspace configuration
└── README.md             # This file
```

## Quick Start

### Requirements
- **Bun 1.3.5** (use `bun --version` to check; install via `curl -fsSL https://bun.sh/install | bash`)
- **Docker Desktop** (required by Supabase CLI for local database)
- **Supabase CLI** (install: `brew install supabase/tap/supabase` or see [docs](https://supabase.com/docs/guides/local-development/cli)))
- **Stripe CLI** (install: `brew install stripe/stripe-cli/stripe` or see [docs](https://stripe.com/docs/stripe-cli)))

### Web App (apps/web) — Full Local Bootstrap

**Prerequisites:**
- Docker Desktop running (for Supabase local containers)
- Stripe CLI installed (for payment testing — optional)

```bash
# 1. Install all workspace dependencies
bun install

# 2. Start local Supabase (Docker containers for DB, API, Studio)
bun run web db:start

# 3. Get local Supabase keys and copy env template
bun run web db:status
# Copy the anon key, service_role key, and DB URL from the output

cp apps/web/.env.local.example apps/web/.env.local
# Edit .env.local with the keys from step 3

# 4. Run migrations and seed the local database
bun run web db:reset

# ⚠️ Known issue: The migration chain has a pre-existing ordering problem
# with the `products_ingestion` table. If `db:reset` fails, check
# `supabase/migrations/20251230180000_products_published_view.sql` —
# it references a table created later. A temporary workaround is to add
# a stub table before the view or use hosted Supabase for now.

# 5. Verify seed data loaded correctly
bun run web local:verify

# 6. Start the Next.js dev server
bun run web dev
# Open http://localhost:3000
```

### Stripe Local Workflow (for card payments)

```bash
# In a separate terminal:
stripe login
bun run web stripe:listen
# Copy the whsec_... secret printed by Stripe CLI into apps/web/.env.local
# Restart Next.js dev server
```

### Stripe Test Cards

| Card Number              | Result         |
|--------------------------|----------------|
| `4242 4242 4242 4242`    | Success        |
| `4000 0000 0000 0002`    | Generic decline|
| `4000 0025 0000 3155`    | Requires SCA/auth|

### Scraper (apps/scraper)

```bash
# Use the Bun workspace shortcut:
bun run scraper dev
```

## Workspace Commands

```bash
# Convenience (from root)
bun run web:dev           # Start web dev server
bun run web:build         # Build web for production
bun run web:test          # Run web tests
bun run web:typecheck     # TypeScript check
bun run web:db:start      # Start local Supabase
bun run web:db:reset      # Reset + seed local DB
bun run web:db:status     # Supabase status
bun run web:stripe:listen # Start Stripe webhook forwarding
bun run web:bootstrap     # Install + copy env example

# Direct workspace shortcuts
bun run web dev           # Start dev server (apps/web)
bun run web test          # Run tests (apps/web)
bun run web lint          # Lint (apps/web)

# Scraper commands (uses Python directly)
bun run scraper -m scraper_backend.runner --job-id test
```

## Migration Notes

This repository was converted from a git submodule setup to a true monorepo:

- **BayStateApp** → `apps/web` (imported with full git history via git subtree)
- **BayStateScraper** → `apps/scraper` (imported with full git history)

The original repositories have been archived for reference.

## CI/CD

- **Web**: Deployed to Vercel (root directory: `apps/web`)
- **Scraper**: Built as Docker image from `apps/scraper/Dockerfile`

## Tech Stack

| Project | Language | Package Manager | Framework |
|---------|----------|-----------------|-----------|
| Web | TypeScript | Bun 1.3.5 | Next.js 16 |
| Scraper | Python 3.10+ | pip | Playwright + Docker |

## License

Private - Bay State Pet and Garden Supply
