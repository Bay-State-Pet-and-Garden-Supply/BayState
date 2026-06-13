# Add AI-driven product grouping stage before consolidation

The existing consolidation pipeline processes each product independently through
the LLM, yielding inconsistent names, brands, and categories across products that
belong to the same manufacturer product line (e.g., different sizes/flavors of
the same dog food).

We are adding a new **Grouping** pipeline stage between `processed` and `merging`
that uses AI classification to assign each product a canonical Product Line Label.
Products sharing the same label form a Product Group. Consolidation then runs one
LLM call per group — the LLM sees all variants at once and produces inherently
consistent output. The legacy UPC-prefix cohort system (`cohort_batches` /
`cohort_members`) is replaced entirely.

**Status:** accepted

## Considered Options

- **Keep per-product consolidation with sibling hints (status quo).** Each product
  gets its own LLM call with up to 3 sibling products as context. The LLM never sees
  the full product line. Rejected because it produces inconsistent results across
  variants — the core problem we're solving.

- **Two-phase: consolidate individually, then run post-hoc consistency rules.**
  The existing `TwoPhaseConsolidationService` flags brand/category mismatches but
  never resolves them. Rejected because flagging without fixing doesn't close the
  loop.

- **Batch all products into a single LLM call without grouping.** Feed an entire
  cohort (200+ products) into one call. Rejected because token limits, cost, and
  the LLM can't effectively reason about 200 unrelated products.

- **Always split subgroups explicitly.** Every product gets both a Product Line
  Label and a Subgroup Label from classification. Rejected as unnecessary cost —
  the consolidation LLM naturally infers subgroup structure from source data.
  Subgroup detection only runs for oversized groups (>30 UPCs) that exceed token
  limits.

## Consequences

- **Database.** A new `product_lines` table stores canonical Product Line Labels
  with stable UUIDs. The existing `products_ingestion.product_line_id` column is
  repurposed to reference `product_lines.id` via FK. A big-bang migration classifies
  all non-published products at deploy, backfilling assignments.

- **Pipeline status.** A new `grouping` pipeline status is added to
  `PERSISTED_PIPELINE_STATUSES`, `PIPELINE_TABS`, `STATUS_TRANSITIONS`, and all
  status enumeration points. Products flow `processed → grouping → merging`.

- **Batch infrastructure.** A new `execution_mode: 'product_line_classification'`
  is added to the `batch_jobs` check constraint and TS union. Group consolidation
  uses one `batch_job_items` row per **group** (not per UPC), with the parsed
  output flattened into per-UPC results before apply.

- **Cohort system.** `cohort_batches` and `cohort_members` are deprecated. Because
  cohorts are used beyond consolidation (import/sync, extraction brand context,
  admin cohort routes, UI filters, tests), replacement is a cross-pipeline effort
  spanning import, extraction, and admin routes — not just consolidation cleanup.

- **TwoPhaseConsolidationService** and its Phase 2 consistency rules are removed.
  A lightweight output validation step ensures group consolidation responses contain
  every input UPC (reject partial output) and pass schema checks.

- **Classification** follows the consolidation provider setting (not hardcoded to
  DeepSeek). Classification proofs use minimal source data (name, brand, category)
  and output `{ product_line, confidence, rationale }`.

- **Label convergence** uses post-classification fuzzy dedup. Ambiguous merges
  (similarity < 0.95) are flagged for operator review in the Grouping UI. The
  `product_lines` taxonomy accumulates over time and is fed into the classification
  prompt as the allowed vocabulary.

- **Oversized groups** (>30 UPCs) trigger explicit subgroup detection, asking the
  LLM to assign both a Product Line Label and a Subgroup Label within the known
  product line. Each subgroup is consolidated in its own call.

- **Grouping metadata** persisted on `products_ingestion`: classification
  confidence, assignment source (`ai` or `manual`), and the raw LLM label before
  dedup normalization for audit trail.

- **Re-extraction** preserves the existing `product_line_id` assignment (no
  re-classification). The operator can manually reassign through the Grouping UI.
