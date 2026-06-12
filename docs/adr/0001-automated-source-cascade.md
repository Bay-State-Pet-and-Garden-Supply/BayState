# Automated source cascade replaces manual source selection

The extraction pipeline previously required the pipeline manager to manually choose
which distributor sources and extraction modes (mixed/distributor_only/ai_only) to
use per run via the `ManagementPanel` and `ScraperSelectDialog`. We replaced this
with a per-brand **Source Cascade** — an admin-configured ordered list of sources
that the system walks automatically top-to-bottom, running all enabled sources and
keeping all results.

**Why**: Manual selection was error-prone, required the manager to know which
distributors carry which brands, and introduced per-run variability. The cascade
eliminates per-run decisions: configure once per brand, then "Start Extraction" runs
the same deterministic path every time.

**Key design choices**:
- Run all, keep all — early success doesn't short-circuit the cascade. Consolidation
  merges all sources later.
- SERP/AI is terminal fallback — only triggered when every distributor ran cleanly
  and none found the product.
- Distributor errors block SERP — a broken source means we can't trust the cascade
  was exhaustive, so we skip SERP and flag the UPC for attention.
- Brand source priority is enforced — extraction cannot start for a brand until its
  Source Cascade is configured.
- OCR extraction is removed — hasn't proven useful.

**Status**: accepted

**Considered options**:
- Stop at first success: rejected — the consolidation/merging step benefits from
  multiple data sources for cross-validation and gap-filling.
- Keep manual overrides for power users: rejected — adds UI complexity and
  maintenance burden for a path that undermines the deterministic model.
