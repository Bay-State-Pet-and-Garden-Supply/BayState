# Research Agent - Input & Output Contracts

This document defines the data structures and formats used by the `research-agent` pipeline.

The agent's primary purpose is to receive brief identification details for a product (the **Input**), run discovery/acquisition/extraction tasks, and emit a verification report alongside a storefront-ready product draft (the **Outputs**).

---

## 1. Input Contract: `ProductResearchInput`

The entry point of the pipeline. It is defined in Zod within [ProductResearchInput.ts](file:///c:/Users/Nick/Projectos/BayState/apps/research-agent/src/schemas/ProductResearchInput.ts).

### Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `productId` | `string` | **Yes** | Unique identifier for the product (e.g. slug/SKU key). |
| `upc` | `string` | **Yes** | Universal Product Code / Barcode (must be non-empty). |
| `registerName` | `string` | **Yes** | The raw registered name of the product (e.g., from a distributor pricing sheet). |
| `brand` | `string` | **Yes** | The brand name of the product. |
| `officialDomain` | `string` | *Semi* | The brand's official web domain (e.g., `frommfamily.com`). |
| `officialWebsiteUrl` | `string` | *Semi* | The brand's official website URL. |
| `seedCandidateUrls` | `Array<CandidateUrlInput>` | No | Hardcoded/known candidate URLs to start with. |
| `notes` | `string` | No | Additional context, instructions, or specific constraints. |

> [!IMPORTANT]
> **Refinement Constraint**: The input *must* contain at least one of `officialDomain` or `officialWebsiteUrl` to perform official candidate discovery.

### `CandidateUrlInput` Structure

Each candidate provided in `seedCandidateUrls` or discovered in the pipeline adheres to this schema:
* **`url`** (`string`, Required, URL): The target URL.
* **`sourceType`** (`string`, Optional, Default `"input"`): One of `"input" | "official" | "sitemap" | "serp" | "distributor" | "unknown"`.
* **`title`** (`string`, Optional): Title of the page.
* **`snippet`** (`string`, Optional): Search result snippet/text preview.
* **`discoveredFrom`** (`string`, Optional): Source that suggested this URL.

### Input JSON Example

```json
{
  "productId": "fromm-cat-purrsnick-duck-stew-3oz",
  "upc": "072705113446",
  "registerName": "Fromm Cat PurrSnickitty Duck Stew 3 oz",
  "brand": "Fromm",
  "officialWebsiteUrl": "https://frommfamily.com",
  "seedCandidateUrls": [
    {
      "url": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "sourceType": "official"
    }
  ],
  "notes": "Please verify if this can is 3 oz or if there is a 5.5 oz variant."
}
```

---

## 2. The Evidence Value Pattern (`EvidenceValue<T>`)

To support high auditability, the agent wraps extracted product details and listing values in an `EvidenceValue<T>` container defined in [Evidence.ts](file:///c:/Users/Nick/Projectos/BayState/apps/research-agent/src/schemas/Evidence.ts). This ensures that every field in the output can be traced back to its provenance.

```typescript
interface EvidenceValue<T> {
  value: T;                       // The actual value (e.g., string, array, object)
  confidence: number;            // Score from 0.0 to 1.0
  sourceType: EvidenceSourceType; // Heuristic, Metadata, JSON-LD, etc.
  sourceUrl?: string;            // The URL from which this detail was extracted
  evidence: string;              // Snippet or explanation proving the claim
}
```

### Supported `EvidenceSourceType` Values
* `"input"` — Derived from user/coordinator input.
* `"candidate"` — General candidate evaluation heuristics.
* `"heuristic"` — Custom text parsing, pattern matching, or token overlap.
* `"jsonld"` — Extracted directly from schema.org JSON-LD blocks on the page.
* `"meta"` — Extracted from OpenGraph/meta tags or title headers.
* `"scraper"` — Extracted via the legacy Python crawl/scrape layer.
* `"manual"` — Manual adjustment or manual review input.

---

## 3. Output Contract 1: `ProductResearchReport`

The complete execution transcript, evaluations, diagnostic logs, and confidence scoring. Defined in [ProductResearchReport.ts](file:///c:/Users/Nick/Projectos/BayState/apps/research-agent/src/schemas/ProductResearchReport.ts).

### Fields

* **`runId`** (`string`): Unique ID representing this research execution.
* **`status`** (`"completed" | "needs_review" | "needs_more_candidates"`): Overall outcome status.
* **`generatedAt`** (`string`, ISO datetime): Timestamp of completion.
* **`input`** (`ResolvedProductResearchInput`): Echoes the initial inputs along with any resolved domain metadata.
* **`selectedCanonicalUrl`** (`string`, URL, Optional): The URL selected as the official/canonical source.
* **`productIdentity`**: Evidence-wrapped identity signals:
  - `brand` (`EvidenceValue<string>`)
  - `registerName` (`EvidenceValue<string>`)
  - `upc` (`EvidenceValue<string>`)
  - `size` (`EvidenceValue<string>`)
  - `flavor` (`EvidenceValue<string>`)
  - `variant` (`EvidenceValue<string>`)
* **`extracted`**: Raw extracted text evidence fields:
  - `description` (`EvidenceValue<string>`)
  - `images` (`EvidenceValue<string[]>`)
  - `categories` (`EvidenceValue<string[]>`)
  - `attributes` (`EvidenceValue<Record<string, unknown>>`)
* **`candidates`** (`Array<EvaluatedCandidate>`): All discovered URLs and their evaluation scores.
* **`confidence`**: Sub-score break down from 0.0 to 1.0:
  - `overall`: Aggregate research confidence.
  - `identityMatch`: Match score between extraction and input brand/UPC/name.
  - `variantMatch`: Match score for weight/flavor.
  - `extractionCompleteness`: Presence of descriptions, images, categories.
  - `sourceAuthority`: Canonical domain match or domain trust score.
* **`warnings`** (`string[]`): Warnings triggered during processing.
* **`nextActions`** (`string[]`): Recommended next tasks for the pipeline or operator.
* **`diagnostics`** (Optional): Detail acquisition logs per URL.
* **`agentDecision`** (Optional, `AgentCandidateDecision`): Structured output from the Pi/LLM agent.
* **`artifacts`** (Optional): Directories and paths containing generated reports, storefront drafts, and markdown summaries.

### `EvaluatedCandidate` Structure

* **`url`** / **`normalizedUrl`** (`string`): Input and normalized URL targets.
* **`normalizedDomain`** (`string`): Extracted domain for authority mapping.
* **`matchedTokens`** (`string[]`): Tokens matching input product name keywords.
* **`score`** (`number`): Weighted score (0.0 to 1.0) indicating overall suitability.
* **`authorityScore`** / **`relevanceScore`** / **`variantScore`** / **`pathScore`** (`number`): Core evaluation dimensions.
* **`decision`** (`"selected" | "rejected" | "needs_review"`): Verdict on this specific URL candidate.
* **`reasons`** / **`warnings`** (`string[]`): Explanations supporting the decision.

### `AgentCandidateDecision` Structure

If the standalone Pi/LLM agent is enabled (via `agent-research-product`), it appends this structure:
* **`selectedUrl`** (`string`, URL, Optional): The URL selected by the LLM.
* **`rationale`** (`string`): The logical explanation for the decision.
* **`confidence`** (`number`, Optional): LLM self-assessed confidence.
* **`defer`** (`boolean`): True if the LLM decides to defer the product to manual review.
* **`recordedAt`** (`string`, ISO datetime): Timestamp of the decision.
* **`source`** (`"pi_harness"`): Identification marker.

### Report JSON Example

```json
{
  "runId": "run_01j7y21rdbf3h5b27e8wqw2109",
  "status": "completed",
  "generatedAt": "2026-05-28T07:12:45.123Z",
  "input": {
    "productId": "fromm-cat-purrsnick-duck-stew-3oz",
    "upc": "072705113446",
    "registerName": "Fromm Cat PurrSnickitty Duck Stew 3 oz",
    "brand": "Fromm",
    "officialWebsiteUrl": "https://frommfamily.com",
    "seedCandidateUrls": []
  },
  "selectedCanonicalUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
  "productIdentity": {
    "brand": {
      "value": "Fromm",
      "confidence": 1.0,
      "sourceType": "jsonld",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "Brand field found in product schema.org JSON-LD"
    },
    "upc": {
      "value": "072705113446",
      "confidence": 1.0,
      "sourceType": "jsonld",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "gtin12 field value matched in JSON-LD"
    }
  },
  "extracted": {
    "description": {
      "value": "A gourmet stew of duck and potatoes simmered in broth.",
      "confidence": 0.95,
      "sourceType": "meta",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "og:description meta tag"
    },
    "images": {
      "value": ["https://frommfamily.com/images/duck-stew-can.png"],
      "confidence": 0.9,
      "sourceType": "jsonld",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "schema.org image array property"
    }
  },
  "candidates": [
    {
      "url": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "normalizedUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "normalizedDomain": "frommfamily.com",
      "sourceType": "official",
      "matchedTokens": ["duck", "stew"],
      "score": 0.95,
      "authorityScore": 1.0,
      "relevanceScore": 0.9,
      "variantScore": 1.0,
      "pathScore": 0.9,
      "decision": "selected",
      "reason": "Official brand domain product page with exact UPC match",
      "reasons": ["UPC matched exactly", "Official brand authority URL"],
      "warnings": []
    }
  ],
  "confidence": {
    "overall": 0.97,
    "identityMatch": 1.0,
    "variantMatch": 1.0,
    "extractionCompleteness": 0.9,
    "sourceAuthority": 1.0
  },
  "warnings": [],
  "nextActions": []
}
```

---

## 4. Output Contract 2: `StorefrontProductDraft`

The final output draft compiled for publication. This schema standardizes the product structure so the coordinator (`apps/web`) can map it cleanly to commerce backends (e.g. Shopify, local database schema). Defined in [StorefrontProduct.ts](file:///c:/Users/Nick/Projectos/BayState/apps/research-agent/src/schemas/StorefrontProduct.ts).

### Fields

* **`productId`** (`string`): Matches the initial input `productId`.
* **`generatedAt`** (`string`, ISO datetime): Timestamp of assembly.
* **`readiness`**:
  - `status` (`"ready" | "needs_review" | "blocked"`): Determined by confidence, missing fields, and warning thresholds.
  - `confidence` (`number`): Overall readiness score (0.0 to 1.0).
  - `missingFields` (`string[]`): Fields that are missing but required for full readiness.
  - `warnings` (`string[]`): Critical warnings that require user attention.
* **`identity`**:
  - `title` (`EvidenceValue<string>`): E.g., "Fromm PurrSnickitty Duck Stew Canned Cat Food".
  - `brand` (`EvidenceValue<string>`): E.g., "Fromm".
  - `canonicalUrl` (`EvidenceValue<string>`, Optional): The verified official URL.
  - `upc` (`EvidenceValue<string>`, Optional): Barcode.
* **`listing`**:
  - `handle` (`string`): URL-friendly slug (e.g. `fromm-purrsnickitty-duck-stew-canned-cat-food`).
  - `productType` (`EvidenceValue<string>`, Optional): General product type categorization.
  - `category` (`EvidenceValue<string>`, Optional): Breadcrumb hierarchy.
  - `descriptionText` (`EvidenceValue<string>`, Optional): Plaintext product description.
  - `descriptionHtml` (`EvidenceValue<string>`, Optional): HTML description containing formatted specs, ingredients, etc.
  - `tags` (`EvidenceValue<string[]>`, Optional): Merged system and vendor tags.
* **`media`**:
  - `images` (`Array<StorefrontImage>`):
    - `url` (`string`, URL): Image URL.
    - `altText` (`string`, Optional): Image description text.
    - `sourceUrl` (`string`, Optional): Source page image was extracted from.
    - `confidence` (`number`): Trust value for this image.
* **`variants`** (`Array<StorefrontVariantDraft>`): Min 1 variant is required.
  - `title` (`string`): E.g. "3 oz Can".
  - `sku` (`string`, Optional): Variant-specific SKU.
  - `barcode` (`string`, Optional): UPC.
  - `price` (`string`, Optional): Extracted list price (e.g., `"2.99"`).
  - `compareAtPrice` (`string`, Optional): MSRP.
  - `optionValues` (`Record<string, string>`): Option map (e.g. `{"Size": "3 oz"}`).
  - `attributes` (`Record<string, unknown>`): Nested technical properties.
* **`attributes`** (`EvidenceValue<Record<string, unknown>>`, Optional): Product-level attributes.
* **`seo`**:
  - `title` (`string`, Optional): Custom page Title.
  - `description` (`string`, Optional): Custom page Meta Description.
* **`provenance`**:
  - `reportRunId` (`string`): Links back to the `runId` of the `ProductResearchReport`.
  - `sourceUrls` (`string[]`): All unique URLs utilized to extract data.
  - `agentDecisionUrl` (`string`, URL, Optional): The selected URL from the agent's step.

### Storefront Draft JSON Example

```json
{
  "productId": "fromm-cat-purrsnick-duck-stew-3oz",
  "generatedAt": "2026-05-28T07:12:45.321Z",
  "readiness": {
    "status": "ready",
    "confidence": 0.95,
    "missingFields": [],
    "warnings": []
  },
  "identity": {
    "title": {
      "value": "Fromm Cat PurrSnickitty Duck Stew Canned Cat Food - 3 oz",
      "confidence": 0.95,
      "sourceType": "jsonld",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "Extracted name property from product schema.org JSON-LD"
    },
    "brand": {
      "value": "Fromm",
      "confidence": 1.0,
      "sourceType": "jsonld",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "Brand found in product schema.org JSON-LD"
    },
    "canonicalUrl": {
      "value": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "confidence": 1.0,
      "sourceType": "candidate",
      "evidence": "Verified official brand product url"
    },
    "upc": {
      "value": "072705113446",
      "confidence": 1.0,
      "sourceType": "jsonld",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "gtin12 matched"
    }
  },
  "listing": {
    "handle": "fromm-cat-purrsnick-duck-stew-3oz",
    "productType": {
      "value": "Cat Food",
      "confidence": 0.8,
      "sourceType": "heuristic",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "Path categorizations contain 'cat' and 'products'"
    },
    "category": {
      "value": "Cat / Wet Food / Cans",
      "confidence": 0.85,
      "sourceType": "meta",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "Breadcrumbs markup extraction"
    },
    "descriptionText": {
      "value": "Fromm PurrSnickitty Duck Stew is a grain-free canned cat food featuring tender pieces of duck simmered in rich gravy.",
      "confidence": 0.9,
      "sourceType": "meta",
      "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
      "evidence": "og:description header value"
    }
  },
  "media": {
    "images": [
      {
        "url": "https://frommfamily.com/images/duck-stew-can.png",
        "altText": "Fromm PurrSnickitty Duck Stew 3 oz Can",
        "sourceUrl": "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew",
        "confidence": 0.9
      }
    ]
  },
  "variants": [
    {
      "title": "3 oz",
      "sku": "072705113446-3oz",
      "barcode": "072705113446",
      "optionValues": {
        "Size": "3 oz"
      },
      "price": "2.49",
      "attributes": {}
    }
  ],
  "provenance": {
    "reportRunId": "run_01j7y21rdbf3h5b27e8wqw2109",
    "sourceUrls": [
      "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew"
    ]
  }
}
```
