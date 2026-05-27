# Self-Sufficient Research Agent Pipeline

## Direction

`apps/research-agent` is moving from a thin local scoring harness into a self-sufficient product research agent that can take product identity details and produce a storefront-ready product draft.

The existing scraper bridge is a temporary compatibility path only. The target architecture must not require `apps/scraper`, Python scraper internals, or scraper-owned queues/services.

## Target contract

Input:

```ts
ProductResearchInput
```

Output:

```ts
ProductResearchReport + StorefrontProductDraft
```

The report preserves evidence, candidate decisions, warnings, and provenance. The storefront draft is the normalized commerce object that can later be reviewed and published by the web app.

## Pipeline stages

```text
Product details
  ↓
Research brief
  ↓
Candidate discovery
  ↓
Page acquisition / browser research
  ↓
Fact extraction
  ↓
Identity and variant verification
  ↓
Pi adjudication
  ↓
Storefront product assembly
  ↓
QA/readiness gate
  ↓
Artifacts: report.json, storefront-product.json, summaries
```

### 1. Research brief

Normalizes the known product details:

- brand
- register/product name
- UPC/SKU/barcode
- expected size/flavor/variant/category
- official domain hints
- business constraints

### 2. Candidate discovery

Finds possible product pages without assuming they are correct:

- official website search/sitemap
- web search provider results
- distributor/retailer pages
- structured hints from current product records
- optionally previous local artifacts

Discovery returns URL candidates with source metadata, not final decisions.

### 3. Page acquisition / browser research

Fetches and renders pages inside the research-agent runtime rather than delegating to `apps/scraper`.

This stage should be implemented behind a port so the browser substrate can evolve, but the initial agentic browser substrate is now the project-local Vercel `agent-browser` skill.

Supported/possible backends:

- Vercel `agent-browser` skill/CLI for agentic browser acquisition
- plain HTTP fetch for static pages
- future hosted browser worker
- direct Playwright only if `agent-browser` is insufficient for a specific local need

The important boundary is that this app owns the acquisition contract and artifacts.

### 4. Fact extraction

Extracts structured facts from acquired pages:

- JSON-LD/Product schema
- OpenGraph/meta tags
- visible DOM text
- images and alt text
- breadcrumbs/categories
- price/availability when present
- product attributes/specs
- LLM extraction from sanitized page evidence when deterministic extraction is incomplete

Extraction must preserve source URL and evidence snippets for every claim.

### 5. Identity and variant verification

Compares extracted facts against the research brief:

- UPC/barcode exact match
- brand match
- product name token overlap
- size/flavor/variant compatibility
- canonical/official source preference
- wrong-product and category-page detection

Deterministic scoring should shortlist and guardrail, but not silently publish ambiguous results.

### 6. Pi adjudication

Pi remains the agentic reasoning layer.

Pi should use tools to:

- inspect candidate reports
- request additional acquisition/extraction for specific URLs
- compare conflicting evidence
- record a structured final candidate decision
- explain defer/manual-review decisions

Pi should not be responsible for unstructured scraping side effects. It should orchestrate bounded tools and write structured decisions.

### 7. Storefront assembly

Builds a storefront-ready draft:

- title
- handle/slug
- vendor/brand
- product type/category
- HTML/text description
- image set with alt text
- variant/barcode/size/options
- attributes/metafields
- SEO title/description
- tags
- provenance and confidence

### 8. QA/readiness gate

Marks the result as:

- `ready` — enough verified evidence for review/publish
- `needs_review` — plausible but ambiguous or incomplete
- `blocked` — no trustworthy canonical/product identity found

No frontend or coordinator integration is implied by readiness. This remains local/artifact-first until explicitly wired into `apps/web`.

## Legacy compatibility

The current `KnownUrlCliScraperExtractionAdapter` is a legacy bridge for comparing against the existing scraper stack.

It should not be expanded into the target architecture. New work should prefer native research-agent ports and stages.

## Near-term implementation sequence

1. Add shared pipeline/stage interfaces and storefront draft schema.
2. Add a native page acquisition port with a no-op/fixture implementation for tests.
3. Add deterministic extractors for JSON-LD, meta tags, text, and images.
4. Add Pi tools for `acquire_page`, `extract_page_facts`, and `assemble_storefront_product`.
5. Update artifacts to write `storefront-product.json` alongside `report.json`.
6. Keep `--use-scraper` only as a deprecated comparison flag until native extraction is sufficient.
