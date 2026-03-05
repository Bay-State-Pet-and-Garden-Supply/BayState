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

### Web App (apps/web)

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Or using the workspace shortcut
bun run web run dev
```

### Scraper (apps/scraper)

```bash
# Navigate to scraper
cd apps/scraper

# Set up Python environment
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run scraper
python -m scraper_backend.runner --job-id test
```

## Workspace Commands

```bash
# Web app commands
bun run web dev          # Start dev server
bun run web build        # Build for production
bun run web test         # Run tests

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
