# Fix Consolidation Units & Normalize Brands

## Objective
Address two separate data quality issues in the pipeline:
1. Fix incorrect unit parsing during consolidation finalizing where strings like "packets" incorrectly become "pk.ets".
2. Normalize the `brands` table by merging duplicate or slightly varying brand entries (e.g., "Bentley Seed Co." vs "Bentley Seed") into single canonical records.

## Key Files & Context
- `apps/web/lib/consolidation/result-normalizer.ts`: Contains the `normalizeUnits` regex that is missing word boundaries.
- `apps/web/__tests__/lib/consolidation/result-normalizer.test.ts`: Existing test suite to ensure the regex changes work.
- `apps/web/lib/utils/string.ts` or `apps/web/lib/consolidation/batch-service.ts`: Location for brand lookup key normalization.
- `apps/web/scripts/normalize-brands.ts`: New script to perform the automated database cleanup.

## Implementation Steps

### 1. Fix `normalizeUnits` Regex
Update the unit replacements in `result-normalizer.ts` to ensure they only match full words or abbreviations, preventing partial replacements inside words:
- Add a trailing word boundary `\b` or explicitly check for the period outside the word grouping.
- Change `[/\b(packs?|pk\.?)/gi, 'pk.']` to `[/\b(packs?|pk)\b\.?/gi, 'pk.']`
- Change `[/\b(inches?|in\.?)/gi, 'in.']` to something safer like `[/\b(inches?)\b|\bin\./gi, 'in.']` to prevent matching the preposition "in" inside descriptions (e.g., "Made in USA" -> "Made in. USA").
- Apply similar boundary fixes to `lb`, `oz`, `ct`, `ft`, `gal`, `qt`, `pt`, and `L`.

### 2. Improve Brand Canonicalization
Enhance the logic used to match brands during scraping/consolidation:
- Create a `canonicalizeBrandName` function that:
  - Lowers casing.
  - Strips out punctuation and extra whitespace.
  - Removes common company suffixes like "Co.", "Inc.", "LLC".
- Update `normalizeLookupKey` (or where `resolveBrand` looks up brands in `batch-service.ts`) to use this stricter canonicalization, effectively treating "Bentley Seed Co." and "Bentley Seed" as the exact same key, preventing future duplicates.

### 3. Automated Brand Cleanup Script
Create `apps/web/scripts/normalize-brands.ts` to run once locally to clean up the Supabase database:
- **Fetch & Group:** Fetch all `brands` using the `supabase-js` service role key. Group them by their new `canonicalizeBrandName` key.
- **Select Canonical:** For groups with duplicates, pick the oldest brand (based on `created_at`) as the "canonical" brand.
- **Remap Associations:** Update the `brand_id` column in the `products` table and any other relevant tables (like `scraper_runs` or `cohort_batches` if they reference it) to point from the duplicate IDs to the canonical ID.
- **Delete Duplicates:** Delete the duplicate brand records from the `brands` table.
- **Dry-Run Mode:** Add a `--dry-run` flag to the script that logs the proposed merges without executing DB mutations so we can review the exact changes beforehand.

## Verification & Testing
- **Unit Tests:** Add test cases to `result-normalizer.test.ts` for `"Tomato Jubilee Seed packets" -> "Tomato Jubilee Seed pk."` and "10 inches -> 10 in.".
- **Dry Run Output:** Execute `npx ts-node apps/web/scripts/normalize-brands.ts --dry-run` and review the terminal output to ensure valid merges (e.g., "Bentley Seed Co." -> "Bentley Seed") before running it live.
- **Run Live:** Execute the script without `--dry-run` against the development DB, then verify that duplicates are gone.
