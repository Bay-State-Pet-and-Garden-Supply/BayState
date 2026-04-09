- 2026-04-08: Extracted a reusable `scrapers.cohort.CohortProcessor` with configurable `upc_prefix` grouping, preserving short numeric UPCs as-is and skipping empty/non-numeric values.
- 2026-04-08: AI Search family cohorting currently derives keys from set-based tokenization, so callers should not rely on deterministic token order in the family portion of the key without an additional ordering step.

- Task 5: Added scrapers.cohort.grouping with configurable prefix grouping, invalid UPC filtering, size-based cohort splitting, and summary statistics.
- Validation note: current UPC utility treats 072705115815 as valid and 072705115812 as invalid, so cohort tests should use generated/check-digit-verified GTIN fixtures.
- Performance note: grouping 10,000 products with skip_invalid_upcs disabled completes under 1 second in targeted pytest verification.
- 2026-04-08: `WorkflowExecutor` now supports an externally managed `browser_context()` session so cohort runs can reuse a single Playwright login/session across multiple `execute_workflow` calls.
- 2026-04-08: Cohort metadata should be passed with `cohort_context=...`; the executor flattens those keys for step templating and also preserves a nested `cohort_context` dict for action access via `self.ctx.context`.
- 2026-04-08: `CohortJobProcessor` reuses a single initialized workflow executor across batch members, groups valid cohort products together, and falls back to per-product processing for ungrouped/invalid SKUs so cohort mode stays backward compatible.
- 2026-04-08: `runner.run_job` now gates cohort routing behind `USE_COHORT_PROCESSING` and `is_cohort_batch`, falls back to sequential mode when cohort products or representative SKUs are missing, and expands representative results back across all cohort member SKUs for backward-compatible `data` payloads.
- 2026-04-08: `apps/scraper/scripts/migrate_to_cohorts.py` mirrors existing scraper script conventions (sys.path bootstrap + optional Supabase client), uses `group_products_into_cohorts` with UPC-prefix detection for historical backfill, skips invalid SKUs without aborting, and supports offline dry-run validation through `--input-file` plus JSON reporting.
- 2026-04-08: `scrapers.cohort.aggregation.CohortAggregator` aggregates `CohortJobResult.results` without mutating member payloads, resolves brand/category through configurable dotted paths, and emits warning-only inconsistency reports plus cohort-level field summaries/consistency scoring.

- 2026-04-09: Updated daemon.py and api_client.py for cohort claiming support.
- Added ClaimedCohort dataclass with fields: cohort_id, cohort_index, products, scrapers, scraper_config.
- Added claim_cohort() and submit_cohort_results() methods to ScraperAPIClient.
- Daemon now tries cohort claiming first (USE_COHORT_PROCESSING env var), falls back to chunk claiming.
- Refactored chunk processing into process_chunk() async function for reuse.
- Added process_cohort() async function to handle cohort batch processing.
- Cohort results submitted via /api/scraper/v1/cohort-callback endpoint.
- All 33 API client unit tests pass with cohort implementation.
- 2026-04-08: `bsr cohort visualize` now registers from `cli/commands/cohort.py`, can load product rows from `--input-file` or `products_ingestion`, filters cohorts by `--upc-prefix`, renders table/json output, and exports a structured JSON visualization payload with cohort size plus brand/category distributions.
- 2026-04-08: `bsr batch test` now registers from `cli/commands/batch.py`, resolves local YAML configs by scraper name or `--config`, builds batch cohorts from `test_skus`, prints per-product execution progress/results, and always writes a JSON report (custom `--output` or `.artifacts/batch-tests/` fallback) for offline analysis.
- 2026-04-08: `apps/scraper/scripts/validate_migration.py` performs dry-run cohort validation against `products_ingestion` or an `--input-file`, reports exact/prefix accuracy plus timing, and surfaces invalid UPCs, singleton cohorts, mixed expected product lines, and fragmented expected lines for migration QA.
- 2026-04-08 Audit: core cohort detection defaults to 8-digit UPC prefixes in `scrapers.cohort.grouping.CohortGroupingConfig`, but the admin `product_lines` schema and routes hard-code 6-digit prefixes, creating a cross-surface mismatch between runner/backend behavior and frontend management.
- 2026-04-08 Audit: the two-phase consolidation path is present end-to-end (`TwoPhaseConsolidationService`, sibling-aware prompt builder, consistency rules, integration tests), so the main backend objective landed even though some supporting admin surfaces are misaligned.
- 2026-04-08 Fidelity check: runtime cohort execution is split between two implementations — `scrapers.cohort.job_processor.CohortJobProcessor` does true shared-browser multi-product processing, but `runner.run_job` currently routes live cohort jobs through representative-SKU fanout that duplicates one result across sibling SKUs instead of invoking the batch processor.
- 2026-04-09 QA: local admin navigation renders the new `Product Lines` entry and `/admin/product-lines` loads in-browser, but the page is currently operating against an empty/missing backend table state rather than verified cohort data.
- 2026-04-09 QA: unauthenticated `curl http://localhost:3000/api/admin/{cohorts,product-lines}` requests redirect to `/login`, so route-group auth is active for these admin APIs even before handler logic runs.

#HY|- 2026-04-08: Task 13: Enhanced ProductSource with sibling context for cohort-based consolidation.
#KB|- Added `sibling_products` field to ProductSource type - flat array with sku, name, brand, category for quick access.
#HW|- Added `CohortSiblingContext` interface and `lookupCohortSiblingContext()` function to query cohort tables (cohort_batches, cohort_members).
#XN|- Added `fetchProductInfoForSiblingContext()` to get name/brand/category from products_ingestion for sibling products.
#BP|- Updated consolidation submit route (`/api/admin/consolidation/submit`) to auto-populate sibling context from cohort tables.
#QR|- Client-provided `productLineContext` still takes precedence over auto-populated data for backward compatibility.
#ZT|- The auto-population flow: lookupCohortSiblingContext → fetchProductInfoForSiblingContext → build productLineContext and sibling_products.

- 2026-04-08: Task 15: Updated prompt-builder with cohort context support
- Added `buildCohortContextFromSiblings()` to build cohort context from flat sibling_products array
- Added `buildMergedCohortContext()` that prefers productLineContext but falls back to sibling_products for backward compatibility
- Added `buildSystemPromptWithCohort()` to include cohort context in system prompts with sibling product details
- Updated `buildUserPromptPayload()` to use merged cohort context (supports both productLineContext and sibling_products)
- Consistency rules are now available both in base system prompt and product-specific cohort context
- All 21 prompt-builder tests pass (11 original + 10 new cohort context tests)
- Backward compatible: prompts work without sibling context, existing productLineContext still supported
- Exported ProductLinePromptContext interface for use by external modules and tests

- 2026-04-09: Task 18: Updated batch job routing to group products by product line
- Added `groupProductsByProductLine()` function that groups products by their `productLineContext.productLine` value
- Products without product_line are grouped under `'__no_product_line__'` key for backward compatibility
- Added `submitBatchByProductLine()` that detects multiple product lines and creates separate batches per line
- If only one product line (or all products have no product line), falls back to original `submitBatch()` behavior
- Returns aggregated result with `_batch_groups` array listing each batch created and `_error_count` for failures
- Added `isSubmitBatchResponse()` type guard for proper TypeScript narrowing
- Updated `SubmitBatchResponse` interface with optional `_batch_groups` and `_error_count` fields
- Export added to consolidation/index.ts
- Build verified: TypeScript compiles without errors
- The existing `buildBatchRoutingKey()` already routes by product line (using first product's line), but this new function ensures products are actually split into separate batches when they have different product lines
