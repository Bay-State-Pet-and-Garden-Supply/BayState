# Bay State Workspace Context for Gemini

## Workspace Overview
This workspace contains three interconnected projects for Bay State Pet & Garden Supply e-commerce operations.

## Projects

### BayStateApp (Primary Focus)
**Role:** Next.js e-commerce PWA replacing legacy ShopSite website

**Key Technologies:**
- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS v4, shadcn/ui
- **Testing:** Jest, React Testing Library

**Development:**
```bash
cd BayStateApp
npm install
npm run dev          # localhost:3000
npm run lint         # ESLint
npm test             # Jest
```

---

### BayStateScraper (Active)
**Role:** Distributed scrapers deployed via GitHub Actions to self-hosted Docker runners

**Key Technologies:**
- **Language:** Python 3.10+
- **Scraping:** Playwright
- **Container:** Docker
- **Orchestration:** GitHub Actions (workflow_dispatch)

**Architecture:** BayStateApp admin → GitHub Actions → Self-hosted runner → Docker → Webhook callback to BayStateApp

---

### BayStateTools (Deprecated)
**Role:** Legacy desktop scraper tool - **REFERENCE ONLY**

**Status:** ⚠️ Being replaced by BayStateApp admin panel

**Use for:** Understanding scraper configs/patterns when porting to BayStateApp

---

## Development Conventions

### When Working in BayStateApp
- Default to Server Components; use `'use client'` only when needed
- Use path alias `@/*` for imports
- Test files in `__tests__/` mirroring source structure
- Commit format: `<type>(<scope>): <description>`

### When Working in BayStateScraper
- Scrapers defined in YAML configs, not code
- Docker API is for scraper execution ONLY
- Results sent via webhook to BayStateApp

### When Referencing BayStateTools
- DO NOT modify this project
- Use as reference for scraper YAML patterns
- Port features to BayStateApp, not here
