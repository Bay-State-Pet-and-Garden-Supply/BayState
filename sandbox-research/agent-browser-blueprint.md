I left `/Users/nickborrello/Desktop/Projects/BayState/sandbox-research/agent-browser-blueprint.md` unchanged because the task also said “Do not edit files.” Blueprint content:

```md
# agent-browser Local Sandbox Blueprint

## Context

- Installed `agent-browser` version checked: `0.9.1`.
- Installed-version skill command from newer docs is unavailable:
  - `agent-browser skills get core` → `Unknown command: skills`
- Use `agent-browser --help` for this installed CLI.
- This workflow is a local fallback evaluator/extractor for ecommerce PDPs, not a replacement for the Crawl4AI runner.

## Goal

Use `agent-browser` to capture browser-rendered product-page evidence when Crawl4AI extraction is missing, suspicious, or needs visual/manual-style validation.

Primary extracted fields should align with the current Crawl4AI v4 prompt:

```json
{
  "product_name": "",
  "brand": "",
  "description": "",
  "size_metrics": "",
  "images": [],
  "categories": []
}
```

Optional diagnostic fields may include `price`, `availability`, `json_ld`, `meta`, `snapshot`, and artifact paths.

## Session Setup

```bash
export SKU="045663976873"
export URL="https://example.com/product-page"
export RUN_ID="$(date +%Y%m%d_%H%M%S)-$SKU"
export AB_SESSION="bsr-ab-$RUN_ID"
export AB_OUT="sandbox-research/agent-browser-runs/$RUN_ID"

mkdir -p "$AB_OUT"

agent-browser --session "$AB_SESSION" --profile "$AB_OUT/profile" set viewport 1365 900
agent-browser --session "$AB_SESSION" --profile "$AB_OUT/profile" open "$URL"
agent-browser --session "$AB_SESSION" wait 3000
```

Recommended cleanup:

```bash
agent-browser --session "$AB_SESSION" close || true
```

For auth-gated distributor pages, prefer a persistent profile:

```bash
agent-browser --session "$AB_SESSION" \
  --profile "$HOME/.baystate-agent-browser/profiles/distributor-name" \
  open "$URL"
```

## Evidence Capture Patterns

### Accessibility Snapshot

Full snapshot:

```bash
agent-browser --session "$AB_SESSION" --json snapshot > "$AB_OUT/snapshot.json"
```

Interactive-only snapshot:

```bash
agent-browser --session "$AB_SESSION" --json snapshot -i > "$AB_OUT/snapshot-interactive.json"
```

Use snapshot refs for manual fallback actions:

```bash
agent-browser --session "$AB_SESSION" click @e2
agent-browser --session "$AB_SESSION" wait 1000
agent-browser --session "$AB_SESSION" --json snapshot > "$AB_OUT/snapshot-after-expand.json"
```

Useful patterns:

```bash
agent-browser --session "$AB_SESSION" find role button click --name "Accept"
agent-browser --session "$AB_SESSION" find text "Specifications" click
agent-browser --session "$AB_SESSION" find text "Description" click
agent-browser --session "$AB_SESSION" scroll down 900
```

### Screenshot

Viewport screenshot:

```bash
agent-browser --session "$AB_SESSION" screenshot "$AB_OUT/page.png"
```

Full-page screenshot:

```bash
agent-browser --session "$AB_SESSION" --full screenshot "$AB_OUT/page-full.png"
```

### JS Extraction

`agent-browser --json eval` can return objects directly:

```bash
agent-browser --session "$AB_SESSION" --json eval '
(() => {
  const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
  const abs = (u) => {
    try { return new URL(u, location.href).href; } catch { return null; }
  };
  const meta = (name) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || "";

  const jsonLd = [...document.querySelectorAll("script[type*=\"ld+json\"]")]
    .flatMap((s) => {
      try {
        const parsed = JSON.parse(s.textContent || "null");
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [];
      }
    });

  const productLd = jsonLd.find((x) => {
    const t = x && x["@type"];
    return t === "Product" || (Array.isArray(t) && t.includes("Product"));
  }) || {};

  const title =
    clean(productLd.name) ||
    clean(meta("og:title")) ||
    clean(document.querySelector("h1")?.textContent) ||
    clean(document.title);

  const brand =
    clean(productLd.brand?.name || productLd.brand) ||
    clean(document.querySelector("[itemprop=brand]")?.textContent);

  const description =
    clean(productLd.description) ||
    clean(meta("description")) ||
    clean(meta("og:description")) ||
    clean(document.querySelector("[itemprop=description], .description, #description")?.textContent);

  const images = [
    productLd.image,
    meta("og:image"),
    ...[...document.images].map((img) => img.currentSrc || img.src)
  ]
    .flat()
    .filter(Boolean)
    .map(abs)
    .filter(Boolean)
    .filter((u, i, a) => a.indexOf(u) === i)
    .slice(0, 10);

  const breadcrumbs = [...document.querySelectorAll(
    "[aria-label*=breadcrumb i] a, nav.breadcrumb a, .breadcrumb a, [itemprop=itemListElement]"
  )]
    .map((el) => clean(el.textContent))
    .filter(Boolean)
    .filter((x) => !/^(home|shop|products|brands|departments)$/i.test(x))
    .slice(-4);

  const bodyText = clean(document.body.innerText);
  const sizeMatch = bodyText.match(/\b\d+(?:\.\d+)?\s?(?:oz|lb|lbs|g|kg|ml|l|fl oz|count|ct|cu ft|quart|qt|gal|inch|in)\b/i);

  return {
    extractor: "agent-browser",
    url: location.href,
    page_title: document.title,
    extracted: {
      product_name: title,
      brand,
      description,
      size_metrics: sizeMatch ? sizeMatch[0] : "",
      images,
      categories: breadcrumbs
    },
    evidence: {
      json_ld_product_found: Boolean(productLd.name || productLd.description),
      meta: {
        og_title: meta("og:title"),
        og_description: meta("og:description"),
        og_image: meta("og:image")
      }
    },
    diagnostics: {
      image_count: images.length,
      body_text_length: bodyText.length
    }
  };
})()
' > "$AB_OUT/dom-extract.json"
```

## Output JSON Shape

Recommended persisted result:

```json
{
  "schema_version": "agent_browser_product_eval.v1",
  "extractor": {
    "name": "agent-browser",
    "version": "0.9.1",
    "mode": "local_sandbox"
  },
  "input": {
    "sku": "045663976873",
    "url": "https://example.com/product-page",
    "expected_brand": null,
    "expected_product_name": null
  },
  "session": {
    "name": "bsr-ab-...",
    "profile": "sandbox-research/agent-browser-runs/.../profile"
  },
  "page": {
    "requested_url": "https://example.com/product-page",
    "final_url": "https://example.com/product-page",
    "title": "Page title"
  },
  "artifacts": {
    "snapshot_json": "snapshot.json",
    "snapshot_interactive_json": "snapshot-interactive.json",
    "screenshot_png": "page.png",
    "full_screenshot_png": "page-full.png",
    "dom_extract_json": "dom-extract.json"
  },
  "extracted": {
    "product_name": "",
    "brand": "",
    "description": "",
    "size_metrics": "",
    "images": [],
    "categories": []
  },
  "normalized_for_baystate": {
    "name": "",
    "brand": "",
    "description": "",
    "weight": "",
    "image_urls": [],
    "category": ""
  },
  "confidence": {
    "overall": 0.0,
    "fields": {
      "product_name": 0.0,
      "brand": 0.0,
      "description": 0.0,
      "size_metrics": 0.0,
      "images": 0.0,
      "categories": 0.0
    }
  },
  "diagnostics": {
    "json_ld_product_found": false,
    "snapshot_refs_used": [],
    "actions_taken": [],
    "errors": []
  }
}
```

## Compare Against Crawl4AI

Important repo note: current `apps/scraper/runner/__init__.py` deprecates direct URL extraction. The older README command:

```bash
python runner.py --upc "$SKU" --url "$URL" --debug
```

may no longer produce a direct URL Crawl4AI baseline. For current comparison, use the approved-source extraction path or a local harness around `ProductPageExtractor`.

### Baseline Inputs

Compare these normalized fields:

| agent-browser | Crawl4AI v4 / BayState |
|---|---|
| `extracted.product_name` | `product_name` or `product.name` |
| `extracted.brand` | `brand` or `product.brand` |
| `extracted.description` | `description` |
| `extracted.size_metrics` | `size_metrics`, `weight`, or `size` |
| `extracted.images` | `images` or `image_urls` |
| `extracted.categories` | `categories` or `category` |

### Scoring

Reuse existing evaluation behavior where practical:

- `apps/scraper/tests/evaluation/field_comparator.py`
  - `brand`, `upc`: exact normalized match
  - `images`, `categories`, `features`: list overlap
  - text fields: token similarity

Suggested weighted score:

```json
{
  "weights": {
    "product_name": 0.25,
    "brand": 0.20,
    "description": 0.20,
    "size_metrics": 0.15,
    "images": 0.10,
    "categories": 0.10
  }
}
```

Pass/fail thresholds:

- `>= 0.85`: agent-browser corroborates Crawl4AI
- `0.65–0.84`: partial agreement; inspect screenshot/snapshot
- `< 0.65`: extraction conflict; mark for review or retry with expanded interactions

### Comparison Output

```json
{
  "sku": "045663976873",
  "url": "https://example.com/product-page",
  "crawl4ai_status": "success",
  "agent_browser_status": "success",
  "overall_score": 0.82,
  "field_comparisons": [
    {
      "field": "product_name",
      "crawl4ai": "Four Paws Wee-Wee Pads",
      "agent_browser": "Four Paws Wee-Wee Pads 30 Count",
      "score": 0.86,
      "match_type": "fuzzy"
    }
  ],
  "recommendation": "review",
  "artifacts": {
    "agent_browser": "sandbox-research/agent-browser-runs/...",
    "crawl4ai": "path/to/crawl4ai-result.json"
  }
}
```

## When To Use This Fallback

Use agent-browser when:

1. Crawl4AI returns low confidence or missing required fields.
2. A page is JS-heavy and rendered evidence is needed.
3. Auth/session/cookie state affects what product content appears.
4. Visual evidence is needed for debugging image or variant mismatch.
5. Admin Scraper Lab / test assertions need an independent browser-rendered comparator.

Do not use it as the production scraping engine unless it is wrapped behind the existing coordinator-runner contract and structured logging/error classification rules.
```