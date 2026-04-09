- 2026-04-08: Extracted a reusable `scrapers.cohort.CohortProcessor` with configurable `upc_prefix` grouping, preserving short numeric UPCs as-is and skipping empty/non-numeric values.
- 2026-04-08: AI Search family cohorting currently derives keys from set-based tokenization, so callers should not rely on deterministic token order in the family portion of the key without an additional ordering step.

- Task 5: Added scrapers.cohort.grouping with configurable prefix grouping, invalid UPC filtering, size-based cohort splitting, and summary statistics.
- Validation note: current UPC utility treats 072705115815 as valid and 072705115812 as invalid, so cohort tests should use generated/check-digit-verified GTIN fixtures.
- Performance note: grouping 10,000 products with skip_invalid_upcs disabled completes under 1 second in targeted pytest verification.
