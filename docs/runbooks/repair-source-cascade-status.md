# Repair Source Cascade Status for Stuck Products

## Overview

After deploying the Automated Source Cascade, some products may be stuck in
`needs_attention` despite having usable enrichment data. This runbook helps
identify and repair those products.

## Root Causes

1. **Outcome normalization** — Some sources (e.g. Amazon/marketplace) emit
   product data with `outcome: null`. The callback normalizes this to `found`,
   but products processed before the fix may have incorrectly persisted
   `source_error`.
2. **Bradley no-match misclassification** — Bradley's "No matching product
   card found" was classified as `source_error` instead of `not_stocked`.
3. **Old status logic** — Previous code treated any `source_error` as
   unconditional `needs_attention`, ignoring found results from other sources.

## Prerequisites

- Admin access to Supabase (can run SQL queries)
- The code fix has been deployed (normalized outcomes, found-wins status logic)
- Scraper runners are running the updated code

## Step 1: Verify affected products

Run this read-only query to find `needs_attention` products with usable data:

```sql
SELECT
  pi.upc,
  pi.error_message,
  pi.sources->'enriched'->>'name' AS enriched_name,
  pi.sources->'enriched'->>'confidence_score' AS enrichment_confidence,
  esa.source_slug,
  esa.outcome AS persisted_outcome,
  esa.error_code,
  esa.error_message AS attempt_error,
  CASE
    WHEN pi.sources->'enriched'->>'name' IS NOT NULL
      AND pi.sources->'enriched'->>'name' != ''
      AND pi.sources->'enriched'->>'confidence_score' IS NOT NULL
      AND (pi.sources->'enriched'->>'confidence_score')::numeric >= 0.7
    THEN 'HIGH - ready for processed'
    WHEN esa.outcome = 'source_error'
      AND esa.error_message ILIKE '%No matching product card found%'
    THEN 'LOW - misclassified no-match'
    ELSE 'REVIEW'
  END AS recommendation
FROM products_ingestion pi
LEFT JOIN LATERAL (
  SELECT * FROM enrichment_source_attempts
  WHERE upc = pi.upc
  ORDER BY attempted_at DESC
  LIMIT 5
) esa ON true
WHERE pi.pipeline_status = 'needs_attention'
ORDER BY enrichment_confidence DESC NULLS LAST;
```

## Step 2: Preview repairs

For each category of product, run the SELECT-only preview first:

### 2a. High-confidence products with usable enriched data

```sql
-- Preview: products with enriched name + confidence >= 0.7
SELECT pi.upc, pi.sources->'enriched'->>'name' AS name,
       pi.sources->'enriched'->>'confidence_score' AS confidence
FROM products_ingestion pi
WHERE pi.pipeline_status = 'needs_attention'
  AND pi.sources->'enriched'->>'name' IS NOT NULL
  AND pi.sources->'enriched'->>'name' != ''
  AND pi.sources->'enriched'->>'confidence_score' IS NOT NULL
  AND (pi.sources->'enriched'->>'confidence_score')::numeric >= 0.7;
```

### 2b. Bradley misclassified no-match attempts

```sql
-- Preview: source attempts with Bradley no-match message
SELECT esa.upc, esa.source_slug, esa.outcome, esa.error_message,
       esa.error_code
FROM enrichment_source_attempts esa
WHERE esa.outcome = 'source_error'
  AND esa.error_message ILIKE '%No matching product card found%';
```

### 2c. Source attempts with usable data persisted as source_error

```sql
-- Preview: source attempts where outcome is source_error but raw_result
-- has product data (e.g. Amazon null-outcome results)
SELECT esa.upc, esa.source_slug, esa.confidence, esa.outcome,
       esa.raw_result->'product'->>'name' AS raw_product_name
FROM enrichment_source_attempts esa
WHERE esa.outcome = 'source_error'
  AND esa.confidence >= 0.7
  AND esa.raw_result->'product' IS NOT NULL;
```

## Step 3: Apply repairs

Once verified, run these UPDATE statements **inside a transaction**.
Rollback is available until committed.

### 3a. Fix Bradley misclassified attempts

```sql
BEGIN;

UPDATE enrichment_source_attempts
SET outcome = 'not_stocked',
    updated_at = NOW()
WHERE outcome = 'source_error'
  AND error_message ILIKE '%No matching product card found%';

-- Verify the change
SELECT COUNT(*) AS updated_rows FROM enrichment_source_attempts
WHERE outcome = 'not_stocked'
  AND error_message ILIKE '%No matching product card found%';

COMMIT;
-- or ROLLBACK;
```

### 3b. Fix source attempts with usable data persisted as source_error

```sql
BEGIN;

UPDATE enrichment_source_attempts
SET outcome = 'found',
    updated_at = NOW()
WHERE outcome = 'source_error'
  AND confidence >= 0.7
  AND raw_result->'product' IS NOT NULL;

-- Verify
SELECT COUNT(*) AS updated_rows FROM enrichment_source_attempts
WHERE outcome = 'found'
  AND raw_result->'product' IS NOT NULL;

COMMIT;
-- or ROLLBACK;
```

### 3c. Move products to processed

Run this step AFTER steps 3a and 3b, only for products where the LATEST
enrichment attempt now has at least one source with outcome = 'found'.
Scoped to the UPCs identified in the preview step 2a:

```sql
BEGIN;

WITH latest_found_upcs AS (
  -- For each UPC, check if the most recent enrichment attempt
  -- has any source with outcome = 'found'
  SELECT DISTINCT esa.upc
  FROM enrichment_source_attempts esa
  INNER JOIN (
    -- Get the latest attempted_at per UPC
    SELECT upc, MAX(attempted_at) AS latest_attempt
    FROM enrichment_source_attempts
    GROUP BY upc
  ) latest ON esa.upc = latest.upc
    AND esa.attempted_at = latest.latest_attempt
  WHERE esa.outcome = 'found'
)
UPDATE products_ingestion pi
SET pipeline_status = 'processed',
    error_message = NULL,
    updated_at = NOW()
FROM latest_found_upcs lfu
WHERE pi.upc = lfu.upc
  AND pi.pipeline_status = 'needs_attention';

-- Verify
SELECT pi.upc, pi.pipeline_status, pi.sources->'enriched'->>'name' AS name
FROM products_ingestion pi
INNER JOIN (
  SELECT DISTINCT upc FROM enrichment_source_attempts
  WHERE (upc, attempted_at) IN (
    SELECT upc, MAX(attempted_at) FROM enrichment_source_attempts GROUP BY upc
  )
  AND outcome = 'found'
) found ON pi.upc = found.upc;

COMMIT;
-- or ROLLBACK;
```

## Step 4: Validate

After repairs, run:

```sql
-- Check needs_attention products remaining — should only be genuine errors
SELECT pipeline_status, COUNT(*) FROM products_ingestion
GROUP BY pipeline_status ORDER BY pipeline_status;

-- List remaining needs_attention products with their error reasons
SELECT pi.upc, pi.error_message,
       esa.outcome, esa.error_code, esa.error_message AS attempt_error
FROM products_ingestion pi
LEFT JOIN LATERAL (
  SELECT * FROM enrichment_source_attempts
  WHERE upc = pi.upc AND outcome = 'source_error'
  ORDER BY attempted_at DESC LIMIT 3
) esa ON true
WHERE pi.pipeline_status = 'needs_attention'
ORDER BY pi.updated_at DESC;
```

## Notes

- These repairs are safe to run at any time. They only update the
  `pipeline_status` and `enrichment_source_attempts.outcome` — they do not
  modify source data or trigger side effects.
- Products left in `needs_attention` after repair are genuine:
  - No source found data AND at least one source had a real error
  - These need human review and potentially manual product/URL entry
- The repair does NOT need to be rerun once the code fix is deployed —
  new callbacks will correctly normalize outcomes and determine status.
