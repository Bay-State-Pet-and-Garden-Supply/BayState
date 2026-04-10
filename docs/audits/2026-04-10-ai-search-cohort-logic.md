# AI Search Scraper — Cohort & URL Fallback Critical Review

**Date:** 2026-04-10  
**Scope:** `scrapers/ai_search/scraper.py`, `scrapers/ai_search/batch_search.py`, `scrapers/cohort/`, `runner/__init__.py`

---

## Executive Summary

The cohort handling in the AI Search scraper has **serious structural disconnects**. There are two parallel systems — a single-product path with cohort state (`scrape_product`) and a batch path (`scrape_products_batch` via `BatchSearchOrchestrator`) — and **the production runner uses neither of them correctly**. The result is that most of the cohort-aware code is effectively dead, URL fallback behavior is fragmented, and there is no mechanism to ensure consistent source URLs across a cohort.

---

## Architecture: Two Disconnected Pipelines

There are **two completely independent code paths** for processing products:

### Path A: `scrape_product()` (Single-product, cohort-aware)
- Accepts `cohort_state: _BatchCohortState | None` parameter
- Uses cohort preferences for domain ranking, brand inference, preferred-domain follow-up searches
- Has a robust 3-attempt fallback loop + parallel candidate discovery fallback
- **Problem: Nobody calls this with `cohort_state` populated in production.**

### Path B: `scrape_products_batch()` → `BatchSearchOrchestrator`
- Uses domain frequency analysis to boost scores
- Has its own extraction loop in `extract_batch()`
- **Does NOT use `_BatchCohortState`, `_save_cohort_state`, or `_get_cached_cohort_state` at all**

### The Production Runner
- **Calls `scraper.scrape_products_batch(items, max_concurrency=max_concurrency)`**
- But `scrape_products_batch` signature is `(self, products: list[dict])` — **it doesn't accept `max_concurrency` at all in the observed code path**.

> [!CAUTION]
> **The runner passes `max_concurrency` to `scrape_products_batch`, but the method signature doesn't accept it.** This is either a runtime crash waiting to happen or evidence the code I see is stale/mismatched.

---

## Flaw 1: `_BatchCohortState` Is Dead Code

### The Evidence

| Method | Status | Impact |
|--------|---------|---|
| `_get_cached_cohort_state` | ❌ Never Called | Cohort history is never retrieved |
| `_save_cohort_state` | ❌ Never Called | Cohort successes are never persisted |
| `remember_domain` | ❌ Never Called | Scraper never "learns" which domains work for a family |
| `_apply_cohort_preferences`| ❌ Unused | Ranking is never adjusted based on cohort success |

**`scrape_product()` is never called by the runner.** The runner calls `scrape_products_batch()`.  
**`scrape_products_batch()` never creates or passes `_BatchCohortState`.**

The entire `_BatchCohortState` system — cohort caching, domain/brand remembering, LRU eviction, preferred domain searches — is orphaned infrastructure that **does nothing in production**.

---

## Flaw 2: URL Fallback Is Fragmented Across Two Systems

### In `scrape_product()` (Path A — not used in production)
- Tries up to **3 URLs sequentially** from ranked candidates
- Each URL goes through: blocked URL check → structured data pre-check → extraction → validation
- If all 3 fail, runs **parallel candidate discovery** on up to 3 more untried URLs
- **Total: Up to 6 URLs tried per product** — a robust strategy

### In `BatchSearchOrchestrator.extract_batch()` (Path B — used in production)
- Each SKU gets **top 3 ranked URLs**
- Tries them sequentially until one succeeds
- **No validation at all** — just checks `result.get("success")`, no brand/name/variant matching
- **No parallel fallback** — if all 3 fail, the product is marked failed
- **No blocked URL filtering** — no `_is_blocked_url()` or `_should_skip_url()` checks

> [!IMPORTANT]
> The production batch path has **significantly weaker URL fallback** than the single-product path. It is missing extraction validation (brand/name checks) and blocked domain filtering.

---

## Flaw 3: No URL Consistency Across Cohort Members

### What "Consistency" Should Mean
When scraping a cohort of related products, you want all products extracted from the **same source domain** (e.g., all from purina.com). This ensures consistent data quality and format.

### What Actually Happens

**In the batch orchestrator (production path):**
- Domain frequency is calculated **pre-search** to boost scores.
- This is a **static signal** — it has no feedback loop during extraction.

**The critical gap:** If Product A succeeds on `chewy.com` and Product B fails on `chewy.com`, Product B falls back to `amazon.com`. There is no mechanism to re-attempt Product B on `chewy.com` or signal to Product C that the cohort has converged on a specific source.

---

## Flaw 4: SKU-First Mode Returns `success=False` for All Products

When `AI_SEARCH_SKU_FIRST=true` (the default), `scrape_products_batch` goes through the SKU-first orchestrator path which hardcodes the result to `success=False`.

```python
output.append(
    AISearchResult(
        success=False,       # ← ALWAYS False
        sku=sku,
        error="Extraction not implemented in SKU-first mode",
    )
)
```

> [!CAUTION]
> **With the default settings, every product in every batch returns `success=False`.** The SKU-first path is "Search Only" and produces no data.

---

## Flaw 5: Batch URL Ranking Ignores Product Context

In `BatchSearchOrchestrator.rank_urls_for_sku`, the scoring function is called with `brand=None, product_name=None, category=None`. This means the ranking is essentially **context-blind**, ignoring the very data (Brand/Name) that makes the search accurate.

---

## Summary of Findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | `_BatchCohortState` is complete dead code | 🔴 Critical |
| 2 | URL fallback in batch path lacks validation | 🔴 Critical |
| 3 | No cross-product URL consistency mechanism | 🟠 High |
| 4 | SKU-first mode returns `success=False` always | 🔴 Critical |
| 5 | Batch URL ranking ignores product context | 🟠 High |
| 6 | Cohort grouping module entirely unused | 🟡 Medium |

---

## Recommended Fixes

1. **Fix or disable SKU-first default**: Implement extraction in SKU-first mode or turn it off.
2. **Unify Validation**: Port the `ExtractionValidator` logic from `scrape_product` into the `BatchSearchOrchestrator`.
3. **Connect the Cohort State**: Modify `BatchSearchOrchestrator` to update and utilize an active `_BatchCohortState` so members "learn" from each other.
4. **Context-Aware Ranking**: Pass `brand` and `product_name` into the `rank_urls_for_sku` scoring call.
5. **Implement Dominant Domain Retries**: If a product fails on the domain that worked for 3+ others in its cohort, perform a targeted site-search on that domain before moving to fallbacks.
