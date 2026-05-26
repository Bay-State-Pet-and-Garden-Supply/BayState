# Brand-Scoped Official Product Page Discovery Proposal

## Purpose

Bay State Pet & Garden Supply needs a reliable workflow for turning register-only product records into draft ecommerce products for the new website.

The starting data is intentionally minimal:

- UPC
- price
- abbreviated register name
- user-selected brand
- user-provided official brand website URL

The goal is **not** to identify the brand from scratch. The user already provides the brand and official URL. The goal is to search within that official brand site, find the best matching product page, extract usable product data and images, and create a reviewable product draft.

This workflow should reduce manual product creation while avoiding the usual AI-powered disaster where a scraper confidently invents half a catalog because a dropdown hurt its feelings.

---

## Core Decision

Use **Crawl4AI as the primary crawler and extractor**.

Use **agent-browser only as a fallback interaction layer** when pages require browser interaction, such as:

- JavaScript-heavy product pages
- brand site search forms
- variant dropdowns
- size/flavor selectors
- image carousels
- lazy-loaded images
- collapsed tabs or accordions
- cookie banners or modal overlays

Do not use agent-browser as the default discovery mechanism. It should not wander through the site like a tiny browser goblin trying to become a merchandiser.

---

## Problem Definition

### Current Input

A register row contains:

```json
{
  "upc": "072705123456",
  "price": 2.99,
  "register_name": "FRM CAT DCK LIV 12OZ",
  "brand_id": "selected_by_user"
}
```

A brand record contains:

```json
{
  "name": "Fromm",
  "official_url": "https://frommfamily.com",
  "official_domain": "frommfamily.com",
  "aliases": ["FRM", "Fromm Family"]
}
```

### Desired Output

A reviewable product draft:

```json
{
  "brand": "Fromm",
  "name": "Duck & Liver Pate",
  "upc": "072705123456",
  "price": 2.99,
  "size": "12 oz",
  "category": "Cat Food",
  "official_url": "https://frommfamily.com/products/example",
  "image_urls": [],
  "description": "...",
  "ingredients": "...",
  "confidence": 0.86,
  "evidence": {
    "matched_url": "...",
    "matched_title": "...",
    "matched_tokens": ["duck", "liver", "cat", "12 oz"]
  },
  "status": "needs_review"
}
```

---

## Proposed Workflow

```text
User provides brand + official URL
        ↓
System normalizes official domain
        ↓
System crawls/indexes official brand site
        ↓
Register rows are imported
        ↓
Each row is matched against brand-scoped URL index
        ↓
Crawl4AI extracts candidate pages
        ↓
Candidate scorer ranks likely product pages
        ↓
agent-browser runs only when interaction is needed
        ↓
System creates product draft with evidence
        ↓
Admin reviews, approves, edits, or rejects
```

---

## Phase 1: Brand Setup

When an admin creates or configures a brand, require:

- brand name
- official website URL
- optional aliases
- optional register abbreviation mappings

Example:

```json
{
  "brand": "Fromm",
  "official_url": "https://frommfamily.com",
  "aliases": ["FRM"]
}
```

The system should normalize and store:

- `official_url`
- `official_domain`
- URL protocol
- root domain
- allowed subdomains
- crawl status
- last crawl time

### Proposed Table: `brands`

```sql
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  official_url text not null,
  official_domain text not null,
  aliases text[] default '{}',
  crawl_status text default 'pending',
  last_crawled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## Phase 2: Brand Site Indexing

The system should crawl the official brand site once and build a searchable index of likely product pages.

### Discovery Sources

For each brand domain, attempt:

1. `sitemap.xml`
2. sitemap links from `robots.txt`
3. homepage internal links
4. category pages
5. product collection pages
6. official site search, if static crawling fails

### Crawl4AI Responsibilities

Crawl4AI should extract:

- URL
- canonical URL
- title
- H1
- breadcrumbs
- page text
- JSON-LD product data
- OpenGraph metadata
- image URLs
- visible product sections
- size/flavor/variant options
- SKU, UPC, GTIN, or MPN candidates when present

### Proposed Table: `brand_url_index`

```sql
create table brand_url_index (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  url text not null,
  canonical_url text,
  title text,
  h1 text,
  breadcrumbs text[],
  page_text text,
  extracted_product_json jsonb,
  image_urls text[],
  variant_options jsonb,
  url_type text default 'unknown',
  crawl_status text default 'pending',
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (brand_id, url)
);
```

### URL Types

The crawler should classify URLs as:

- `product`
- `category`
- `search`
- `collection`
- `blog`
- `support`
- `unknown`

Only `product`, `collection`, and possibly `category` URLs should be used for product resolution.

---

## Phase 3: Register Abbreviation Expansion

The abbreviated register name is a weak but valuable signal.

Example:

```text
FRM CAT DCK LIV 12OZ
```

Possible expansion:

```json
{
  "brand_alias": "FRM",
  "species": "cat",
  "flavor_tokens": ["duck", "liver"],
  "size": "12 oz",
  "package_type": null
}
```

### Proposed Table: `register_abbreviation_rules`

```sql
create table register_abbreviation_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  abbreviation text not null,
  expansion text not null,
  token_type text not null,
  created_at timestamptz default now()
);
```

### Example Rules

| Abbreviation | Expansion | Type |
|---|---|---|
| FRM | Fromm | brand |
| CAT | Cat | species |
| DOG | Dog | species |
| DCK | Duck | flavor |
| LIV | Liver | flavor |
| CHK | Chicken | flavor |
| SAL | Salmon | flavor |
| OZ | oz | unit |
| LB | lb | unit |
| PT | Pate | form |
| CN | Can | package |
| BG | Bag | package |

The abbreviation system should be editable in the admin panel because register names are not standardized. They are tiny corporate cave paintings.

---

## Phase 4: Product Page Candidate Discovery

Given a register row and selected brand, the resolver searches only inside that brand's official domain.

### Input

```json
{
  "upc": "072705123456",
  "price": 2.99,
  "register_name": "FRM CAT DCK LIV 12OZ",
  "brand": "Fromm",
  "official_domain": "frommfamily.com"
}
```

### Search Sources

Use the following sequence:

1. Search local `brand_url_index`
2. Search the official domain via search API
3. Use official site search via agent-browser, only if needed

### Local Index Search

Search over:

- URL slug
- page title
- H1
- breadcrumbs
- page text
- JSON-LD product fields
- variant options
- image alt text if available

Query terms should include:

- UPC
- expanded register name
- species
- flavor tokens
- size
- package type
- brand name
- brand aliases

Example queries:

```text
072705123456
duck liver cat 12 oz
duck liver pate
cat duck liver
```

### Official Domain Search

If local index search is weak, use domain-restricted web search:

```text
site:frommfamily.com "072705123456"
site:frommfamily.com "duck" "liver" "cat"
site:frommfamily.com "duck liver" "12 oz"
```

This should be treated as a fallback enrichment step, not the primary method.

---

## Phase 5: Candidate Extraction

For each candidate URL, run Crawl4AI extraction and produce an evidence packet.

### Evidence Packet

```json
{
  "url": "https://brand.com/products/example-product",
  "canonical_url": "https://brand.com/products/example-product",
  "title": "Example Product",
  "h1": "Example Product",
  "breadcrumbs": ["Cat", "Wet Food"],
  "json_ld": [],
  "meta": {},
  "visible_text": "...",
  "variant_options": ["3 oz", "5.5 oz", "12 oz"],
  "image_urls": [],
  "upc_gtin_candidates": [],
  "sku_candidates": []
}
```

The extractor should preserve evidence for every field. Product creation should not be based on unsupported model output.

---

## Phase 6: Candidate Scoring

Each candidate page should receive a score based on how well it matches the register row and brand constraints.

### Suggested Scoring

```text
+45 UPC/GTIN appears on page
+30 product name token match
+25 flavor/formula token match
+20 size/variant match
+15 species/category match
+10 product JSON-LD exists
+10 URL slug token match
+10 image alt/title matches product terms
+5 price is plausible for size/category

-50 conflicting UPC/GTIN
-35 wrong species
-30 wrong flavor/formula
-25 wrong size/variant
-20 category page instead of product page
-15 low product-page evidence
```

### Confidence Bands

| Score | Action |
|---:|---|
| 90+ | Create high-confidence draft |
| 70-89 | Create draft requiring review |
| 50-69 | Store candidates for manual review |
| < 50 | Mark unresolved |

The official product page does not need to show the UPC. Many brand sites do not publish UPCs. UPC is strong evidence when present, but absence should not automatically reject a candidate.

---

## Phase 7: agent-browser Fallback

Use agent-browser only when Crawl4AI cannot fully inspect a promising page.

### Trigger Conditions

Run agent-browser when:

- the candidate URL is official and promising
- Crawl4AI only finds one image but the page appears to contain a carousel
- variants are hidden behind dropdowns
- the target size/flavor is not visible
- product details are behind accordions or tabs
- official site search requires JavaScript
- content renders only after interaction

### agent-browser Responsibilities

agent-browser should:

- open the candidate URL
- dismiss cookie banners or popups
- expand product details
- click variant controls
- inspect image carousel state
- collect rendered DOM
- collect screenshots if useful
- run JavaScript image extraction helpers
- return enhanced evidence

### Example Image Extraction Script

```js
Array.from(document.querySelectorAll("img, source")).flatMap((el) => {
  const attrs = [
    "src",
    "srcset",
    "data-src",
    "data-srcset",
    "data-large",
    "data-original"
  ];

  return attrs
    .map((attr) => el.getAttribute(attr))
    .filter(Boolean);
});
```

The result should then be passed back into the same scoring and extraction system. agent-browser should not directly decide the final product record.

---

## Phase 8: Product Draft Creation

The resolver should create product drafts, not immediately publish products.

### Proposed Table: `product_creation_drafts`

```sql
create table product_creation_drafts (
  id uuid primary key default gen_random_uuid(),
  register_row_id uuid not null,
  brand_id uuid not null references brands(id),
  selected_url_candidate_id uuid,
  draft_product_data jsonb not null,
  confidence numeric,
  status text default 'needs_review',
  evidence jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Draft Statuses

- `needs_review`
- `approved`
- `rejected`
- `needs_more_data`
- `unresolved`

### Draft Product Data

```json
{
  "name": "Duck & Liver Pate",
  "brand": "Fromm",
  "upc": "072705123456",
  "price": 2.99,
  "size": "12 oz",
  "category": "Cat Food",
  "official_url": "https://frommfamily.com/products/example",
  "image_urls": [],
  "description": "...",
  "ingredients": "...",
  "guaranteed_analysis": "..."
}
```

---

## Admin UI Proposal

### Brand Setup Page

The admin should be able to:

- create/edit brands
- enter official URL
- add brand aliases
- manage abbreviation mappings
- trigger brand site crawl
- view crawl status
- view indexed URLs

### Register Import Review Page

The admin should see:

- UPC
- price
- abbreviated register name
- selected brand
- expanded register interpretation
- match status
- best official URL candidate
- confidence score
- missing fields
- action buttons

### Product Draft Review Page

The admin should be able to:

- compare register row against extracted product data
- view official URL
- view extracted images
- view field-level evidence
- approve draft
- edit draft
- reject candidate
- mark unresolved
- manually enter official URL if needed

---

## Validation Requirements

Every generated draft should include evidence.

### Required Evidence

At minimum:

- selected official URL
- candidate score
- matched title or H1
- matched tokens
- extracted image URLs
- source for each major field

### Reject or Review Required When

- domain is not the official brand domain
- product species conflicts with register name
- size conflicts with register name
- flavor/formula conflicts strongly
- candidate is a category page
- no product-like evidence exists
- extracted fields came only from an LLM with no source text

---

## Recommended Implementation Order

### Step 1: Add Brand Official URL Support

- Add or update `brands` table
- Store official URL and official domain
- Add aliases support
- Add admin UI fields

### Step 2: Add Register Abbreviation Rules

- Create abbreviation rules table
- Add basic parser
- Add admin UI management
- Seed common pet/garden abbreviations

### Step 3: Build Brand URL Indexer

- Fetch sitemap
- Crawl obvious product/category URLs
- Extract URL metadata with Crawl4AI
- Store records in `brand_url_index`

### Step 4: Build Candidate Resolver

- Accept register row + brand
- Expand register name
- Search brand URL index
- Rank candidate URLs
- Store candidates

### Step 5: Add Candidate Extraction

- Run Crawl4AI on top candidate URLs
- Create evidence packets
- Score candidates
- Save score and evidence

### Step 6: Add Product Draft Creation

- Convert high-confidence candidates into product drafts
- Keep uncertain candidates in review state
- Do not auto-publish

### Step 7: Add agent-browser Fallback

- Use only for dynamic/interactive pages
- Add fallback trigger conditions
- Extract enhanced DOM/images/variant evidence
- Re-score after fallback

### Step 8: Add Review UI

- Show register row
- Show expanded interpretation
- Show candidate URLs
- Show confidence/evidence
- Let admin approve/edit/reject

---

## Non-Goals

This proposal does not attempt to:

- discover the brand from UPC alone
- trust random UPC databases as canonical
- scrape retailer pages as official product pages
- fully automate product publishing without review
- use agent-browser as the default crawler
- rely on LLM output without evidence

---

## Risks

### Official Brand Sites May Not Publish UPCs

Mitigation:

- Use UPC as a strong positive signal when present
- Do not require UPC for acceptance
- Match using brand, product tokens, size, species, and variant evidence

### Register Names May Be Too Abbreviated

Mitigation:

- Use editable abbreviation dictionaries
- Store unresolved rows for review
- Learn new abbreviation mappings from admin corrections

### Brand Sites May Hide Images or Variants

Mitigation:

- Use Crawl4AI first
- Use agent-browser fallback for dynamic pages
- Add custom DOM image extraction scripts

### Candidate Scoring Could Over-Match

Mitigation:

- Require confidence thresholds
- Show evidence in admin UI
- Keep manual review before product publishing

### Crawling Could Be Slow

Mitigation:

- Crawl brand sites once
- Cache URL index
- Re-crawl periodically
- Process register rows against local index first

---

## Success Criteria

The workflow is successful if:

- most register rows produce at least one official-domain candidate
- high-confidence drafts require minimal editing
- uncertain matches are clearly flagged
- extracted images improve over current pipeline results
- admins can understand why a match was chosen
- the system avoids publishing bad products automatically
- brand-specific crawling can be reused across many UPCs

---

## Final Recommendation

Build a **brand-scoped official product page resolver**.

The system should assume:

```text
The user provides the brand and official URL.
The register provides UPC, price, and abbreviated name.
The crawler must find the best matching product page inside the official brand site.
```

Recommended architecture:

```text
Brand + official URL
→ Crawl4AI brand site index
→ Register abbreviation expansion
→ Candidate URL search
→ Crawl4AI candidate extraction
→ Candidate scoring
→ agent-browser fallback only for dynamic interaction
→ product draft with evidence
→ admin review
```

This gives Bay State a practical workflow for creating product drafts from register-only records without turning the system into a hallucination-powered merchandiser wearing a browser costume.
