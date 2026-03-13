# Tech Stack

## Application (BayStateApp)
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4, shadcn/ui
- **State Management/Data Fetching:** React Server Components, SWR (or similar for client-side fetching)
- **Testing:** Jest, React Testing Library, Playwright (E2E)
- **Utilities:** yaml (parsing), @monaco-editor/react (code viewer)

## Scraper Backend (BayStateScraper)
- **Language:** Python 3.10+
- **Core Scraping:** Playwright, crawl4ai
- **AI/LLM:** OpenAI (gpt-4o-mini) for source selection and name canonicalization
- **Data Validation:** Pydantic
- **Containerization:** Docker
- **Orchestration:** GitHub Actions (self-hosted runners)

## Infrastructure and Data
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Communication:** Secure webhooks for scraper results
- **Logging:** Structured logging for both Next.js (Winston/Pino) and Python (structlog)
