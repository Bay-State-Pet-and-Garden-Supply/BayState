# worker: Issue #28 — image_text from OCR never sent back to web coordinator

## Changes made

### 1. `apps/scraper/runner/__init__.py` (line ~843)
Added `"image_text": extracted_data.get("Image Text"),` to the payload dict, right after `"images": images,`. This ensures OCR-extracted text from `Image Text` key in scraper results is carried into the product payload sent to the coordinator.

### 2. `apps/scraper/validation/result_quality.py` (line 24)
Added `"image_text": "image_text",` to `FIELD_ALIASES` dict, after `"image_url": "images"`. This enables the canonicalization/normalization pipeline to map `image_text` through without dropping it.

### 3. `apps/scraper/tests/test_runner_image_text_payload.py` (new)
Regression test `test_image_text_field_passed_through_to_payload` that:
- Mocks `WorkflowExecutor` to return a fake scrape result with `"Image Text": "front label text"`
- Calls `run_job()` with a minimal `JobConfig`
- Asserts `results["data"]["TEST-SKU-001"]["test-scraper"]["image_text"] == "front label text"`

## Validation
```
tests/test_runner_image_text_payload.py::test_image_text_field_passed_through_to_payload PASSED
tests/unit/test_result_quality.py::test_sanitize_product_payload_recovers_petfoodex_upc_from_blob PASSED
tests/unit/test_result_quality.py::test_scraper_validator_flags_unrecoverable_identifier_blob PASSED
tests/unit/test_result_quality.py::test_scraper_validator_accepts_canonical_payloads PASSED
```
4 passed in 1.31s. No regressions.

## Hard constraints met
- Minimal edits: only the 3 changes described above.
- `has_data` logic untouched.
- Exact key casing: `extracted_data.get("Image Text")` reads from scraper's `Image Text` key; payload key is lowercase `"image_text"`.
- No unrelated code changed.

## Open risks/questions
- None identified.

## Recommended next step
Deploy. The field will now flow through the existing `sanitize_product_payload` → coordinator pipeline unchanged.
