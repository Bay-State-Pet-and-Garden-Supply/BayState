# BayState Monorepo

This is the monorepo for Bay State Pet and Garden Supply, containing the web application and scraper engine.

## Structure

```
BayState/
├── apps/
│   ├── web/              # Next.js 16 + TypeScript (Port 3000)
│   └── scraper/          # Python + Playwright (Dockerized)
├── packages/             # Shared libraries
├── package.json          # Root orchestration
└── README.md             # This file
```

## Quick Start

### Requirements
- **Bun 1.3.5** (use `bun --version` to check; install via `curl -fsSL https://bun.sh/install | bash`)
- **Docker Desktop** (required for Stripe and Scraper containers)

### The "One-Command" Development Setup

The monorepo uses a containerized orchestration system for Stripe and Scraper. The web app connects directly to the live Supabase project.

```bash
# 1. Install workspace dependencies
bun install

# 2. Set up Supabase keys
cp apps/web/.env.local.example apps/web/.env.local
# Edit apps/web/.env.local and add your SUPABASE_SECRET_KEY

# 3. First-time Stripe setup (prevents race condition)
bun run stripe:setup
# Wait until STRIPE_WEBHOOK_SECRET is written to apps/web/.env.local
# Then you can stop the process (Ctrl+C)

# 4. Start the entire stack
bun run dev:up
```

> [!IMPORTANT]
> **First-time Stripe setup is critical.** `bun run dev:up` starts the web app and Stripe listener in parallel. If the webhook secret doesn't exist yet, Next.js may start before the secret is written, causing webhook verification to fail until a restart. Use `bun run stripe:setup` once to avoid this.

The `dev:up` command automatically:
1. Starts an isolated **Stripe Webhook Listener** (and auto-syncs the secret to `.env.local`).
2. Starts the **Scraper Daemon** in an isolated Docker container (`baystate-scraper-dev`).
3. Starts the **Next.js Web App** on your host machine.

### Core Commands

| Command | Action |
|---------|--------|
| `bun run dev:up` | Start the full development stack |
| `bun run down` | Stop and clean up all dev containers |
| `bun run stripe:login` | Authenticate the Stripe CLI container |
| `bun run scraper:build` | Rebuild the local scraper image |

## Workspace Commands

```bash
# Convenience (from root)
bun run web:dev           # Start web dev server
bun run web:build         # Build web for production
bun run web:test          # Run web tests
bun run web:db:push       # Push migrations to live Supabase

# Scraper commands
bun run scraper:build     # Build dev scraper image
bun run scraper:up        # Start dev scraper container
```

## Stripe Test Cards

| Card Number              | Result         |
|--------------------------|----------------|
| `4242 4242 4242 4242`    | Success        |
| `4000 0000 0000 0002`    | Generic decline|
| `4000 0025 0000 3155`    | Requires SCA/auth|

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
