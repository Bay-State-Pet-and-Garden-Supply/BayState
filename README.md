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
- **Docker Desktop** (required for Supabase, Stripe, and Scraper containers)

### The "One-Command" Development Setup

The monorepo uses a containerized orchestration system to ensure a consistent development experience across machines and total isolation from any live runners on the same system.

```bash
# 1. Install workspace dependencies
bun install

# 2. Link Stripe CLI (One-time setup)
bun run stripe:login

# 3. Start the entire stack
bun run up
```

The `up` command automatically:
1. Starts **Supabase** (Database, Auth, Storage).
2. Syncs **Environment Variables** (Supabase and Scraper keys).
3. Starts an isolated **Stripe Webhook Listener** (and auto-syncs the secret to `.env.local`).
4. Starts the **Scraper Daemon** in an isolated Docker container (`baystate-scraper-dev`).
5. Starts the **Next.js Web App** on your host machine.

### Core Commands

| Command | Action |
|---------|--------|
| `bun run up` | Start the full development stack |
| `bun run down` | Stop and clean up all dev containers |
| `bun run stripe:login` | Authenticate the Stripe CLI container |
| `bun run scraper:build` | Rebuild the local scraper image |

## Workspace Commands

```bash
# Convenience (from root)
bun run web:dev           # Start web dev server
bun run web:build         # Build web for production
bun run web:test          # Run web tests
bun run web:db:start      # Start local Supabase
bun run web:db:reset      # Reset + seed local DB
bun run web:db:status     # Supabase status

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
