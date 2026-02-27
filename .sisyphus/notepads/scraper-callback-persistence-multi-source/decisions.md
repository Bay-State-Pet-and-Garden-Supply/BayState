# Decisions

- Parsed callbacks with shared Zod schema to keep validation deterministic and reusable.
- Added explicit schema guard to require results.data on completed payloads so persistence never sees partial data.

- Introduced `MissingProductsIngestionSkusError` as the deterministic strict-fail signal for callback SKU pre-validation.
- Centralized SKU existence pre-check + persistence in a shared helper and consumed it from both callback routes.

## Task 4: Idempotency Strategy Decisions

### Idempotency Key Format
- **Decision**: Use type-prefixed keys to prevent collisions between admin and chunk callbacks
- **Admin format**: `admin:{job_id}` - single result per job completion
- **Chunk format**: `chunk:{job_id}:{payload_hash}` - supports reprocessing with different data
- **Rationale**: Job IDs could theoretically overlap between callback types; prefixing prevents this

### Payload Hashing Strategy
- **Decision**: SHA-256 first 16 characters for chunk payloads
- **Trade-off**: Balance between collision resistance and key length
- **Alternative considered**: Full SHA-256 (rejected - unnecessarily long keys)
- **Alternative considered**: No hash for chunks (rejected - would prevent reprocessing different data)

### Storage Location
- **Decision**: Store idempotency key in scrape_results.data._idempotency_key
- **Rationale**: No schema migration required, leverages existing JSONB structure
- **Query approach**: Supabase JSONB filter operator `->` for key lookup
- **Alternative considered**: Add dedicated column (rejected - requires migration, minimal benefit)

### Duplicate Response Behavior
- **Decision**: Return HTTP 200 with idempotent: true flag
- **Rationale**: Duplicate is not an error, it's successfully handled; caller gets confirmation
- **Alternative considered**: Return 409 Conflict (rejected - duplicates are expected in distributed systems)

### Test Mode Handling
- **Decision**: Apply idempotency checks to test jobs too
- **Rationale**: Prevents duplicate test run updates even if persistence skipped
- **Behavior**: Idempotency recorded but products_ingestion not updated

## Task 13: Test Matrix Decisions

### Scope Limitation
- **Decision**: Only add tests, do not modify validation logic
- **Rationale**: Keep scope strictly to test expansion per task requirements
- **Evidence**: All tests validate existing Zod schema behavior

### Test Organization
- **Decision**: Use describe blocks for logical grouping, not inline comments
- **Categories**: Missing fields, invalid enums, wrong types, nested, invalid JSON, sanity checks
- **Rationale**: Jest naturally provides test categorization via describe names

## F4: Scope Fidelity Conclusion (2026-02-18)

- F4 scope audit is conditionally in-scope: callback/persistence implementation stays within plan guardrails and no dependency manifests changed.
- Over-build not detected in callback diff set; unrelated root workspace churn exists but is pre-existing and out-of-scope for this plan.
- Under-build not found at code/test behavior level, but evidence traceability has filename-level gaps for Task 9 malformed and Task 10 missing-SKU artifacts that should be reconciled for strict plan artifact parity.
