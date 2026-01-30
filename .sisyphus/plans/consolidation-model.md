# Plan: Perfect Product Consolidation Model (BayStateConsolidator)

## Context

### Original Request
The user wants a "perfect model" for consolidating product data from multiple scraper sources (BayStateScraper) into a final "Golden Record". This logic currently exists in Next.js (BayStateApp) but needs to move to Python (BayStateConsolidator) with enhanced capabilities like OCR and rigorous lineage tracking.

### Interview Summary
**Key Decisions**:
- **Architecture**: `BayStateConsolidator` will be a standalone Python service (FastAPI) triggered by the App via webhook.
- **Data Flow**: Scrapers → App (Raw Storage) → Consolidator (OCR + Logic) → DB (Golden Record).
- **Constraint**: `Excel Price` is the immutable Source of Truth.
- **New Feature**: **OCR** using `gpt-4o` (Vision) to extract ingredients/weight from product images.
- **Schema Strategy**: Separate "Data" (flat) from "Metadata" (lineage/confidence) to keep the final record clean but the history perfect.

**Research Findings**:
- Current consolidation uses OpenAI Batch API in Next.js.
- Scrapers are triggered via DB polling (Daemon pattern).
- No existing OCR capabilities; `gpt-4o` Vision is the best fit for "perfect" quality.
- Logic must port complex Regex from TypeScript to Python.

### Metis Review
**Identified Gaps** (addressed):
- **Taxonomy Drift**: Consolidator will fetch live categories/product types from Supabase at runtime.
- **Regex Compatibility**: Explicit porting and testing of TS regexes to Python `re`.
- **Structured AI**: Use `instructor` library for type-safe LLM outputs.

---

## Work Objectives

### Core Objective
Build a robust Python microservice that ingests raw scraper data, applies "Perfect Model" consolidation rules (including OCR and strict lineage tracking), and writes the "Golden Record" back to Supabase.

### Concrete Deliverables
- **Service**: FastAPI app in `BayStateConsolidator/src` with `/consolidate` endpoint.
- **Models**: Pydantic models for `GoldenRecord`, `ConsolidationMetadata`, and `RawInput`.
- **Logic**: OCR pipeline (GPT-4o), Normalization logic (ported from TS), and Survivorship engine.
- **Database**: Migration to add `consolidation_metadata` column.

### Definition of Done
- [x] Service is running and responding to triggers.
- [x] OCR successfully extracts text from test images.
- [x] Lineage and confidence scores are persisted in `consolidation_metadata`.
- [x] Final "Golden Record" matches strict taxonomy and formatting rules.
- [x] **MOMUS APPROVED**: Plan passes rigorous review.

### Must Have
- **Lineage Tracking**: Every field must know which scraper it came from.
- **Source of Truth Enforcement**: Excel Price must NEVER be overwritten.
- **Live Taxonomy**: Categories must be validated against real DB values.
- **OCR**: Image text extraction.

### Must NOT Have (Guardrails)
- **Manual Regex parsing for JSON**: Use `instructor` instead.
- **Hardcoded Taxonomy**: Categories must be dynamic.
- **Blind Overwrites**: Never overwrite existing manual edits (if tracked).

---

## Verification Strategy

### Test Decision
- **Infrastructure**: Python `pytest` (standard for `BayStateScraper` ecosystem).
- **Strategy**: TDD (Red-Green-Refactor).
- **Integration Tests**: Dockerized Postgres/Supabase local or mocked.

### TDD Workflow
1.  **RED**: Write a test case (e.g., "Consolidator should prefer Excel price over Scraper price").
2.  **GREEN**: Implement the logic.
3.  **REFACTOR**: Optimize.

---

## Task Flow

```
Setup & Schema (1, 2) → Migration (3) → Core Logic (4, 5) → OCR (6) → API (7) → Integration (8)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 4, 5 | Logic and Normalization are independent |
| B | 6 | OCR is a distinct module |

---

## TODOs

- [x] 1. Initialize BayStateConsolidator Service Structure
  **What to do**:
  - Setup `poetry` project with dependencies: `fastapi`, `uvicorn`, `supabase`, `pydantic`, `instructor`, `openai`, `pytest`.
  - Create directory structure: `src/api`, `src/core`, `src/services`.
  
  **References**:
  - `BayStateScraper/pyproject.toml` - Copy relevant dev dependencies.
  
  **Acceptance Criteria**:
  - [x] `poetry install` succeeds.
  - [x] `pytest` runs (0 tests).

- [x] 2. Define "Perfect Model" Pydantic Schemas
  **What to do**:
  - Create `src/models/golden_record.py`:
    - `GoldenRecord` (flat, final output).
    - `ConsolidationMetadata` (nested, lineage tracking).
    - `FieldMetadata` (value, source, confidence, timestamp).
  - Create `src/models/raw.py`:
    - `RawScrapedProduct` (matches Scraper output).
  
  **References**:
  - `BayStateConsolidator/src/baystate_consolidator/models/schema.py` - Current starting point.
  - `BayStateApp/lib/consolidation/types.ts` - Target shape.
  
  **Acceptance Criteria**:
  - [x] Models handle "Excel Price" as a special field.
  - [x] Metadata structure supports multiple sources for one field.

- [x] 3. Database Migration for Metadata
  **What to do**:
  - Create SQL migration in `BayStateApp/supabase/migrations`:
    - Add `consolidation_metadata` (JSONB) to `products_ingestion` table.
  
  **References**:
  - `BayStateApp/supabase/migrations/20260101003000_create_scraping_tables.sql` - Existing schema.
  
  **Acceptance Criteria**:
  - [x] `supabase db push` succeeds.
  - [x] Column exists in local DB.

- [x] 4. Implement Survivorship & Normalization Logic (TDD)
  **What to do**:
  - Port Regex rules from `BayStateApp/lib/consolidation/result-normalizer.ts`.
  - Implement `SurvivorshipEngine`:
    - Rule: Price = Excel (Always).
    - Rule: Text = GPT-4o Synthesis.
  - Use `instructor` to wrap OpenAI calls for synthesis.
  
  **References**:
  - `BayStateApp/lib/consolidation/result-normalizer.ts` - Logic to port.
  
  **Acceptance Criteria**:
  - [x] `pytest tests/unit/test_normalization.py` passes.
  - [x] Regex behavior matches TypeScript exactly (test cases).

- [x] 5. Implement Live Taxonomy Fetcher
  **What to do**:
  - Create `TaxonomyService` that pulls `enums` from Supabase.
  - Cache results for N minutes to avoid DB spam.
  
  **References**:
  - `BayStateApp/lib/consolidation/taxonomy-validator.ts` - Validation logic.
  
  **Acceptance Criteria**:
  - [x] Service returns list of valid Categories.
  - [x] Validates "Dog Food" = Valid, "Dog Chow" = Invalid.

- [x] 6. Implement OCR Service with GPT-4o Vision
  **What to do**:
  - Create `OCRService`:
    - Input: Image URL.
    - Output: Extracted Text (Ingredients, Weight, etc.).
    - Implementation: Call OpenAI Chat Completion with Image input.
  
  **References**:
  - OpenAI Vision API Docs.
  
  **Acceptance Criteria**:
  - [x] Test with sample image URL -> Returns text.
  - [x] Extracted text is added to `RawInput` context.

- [x] 7. Create FastAPI Webhook Endpoint
  **What to do**:
  - Create `src/api/routes.py`:
    - `POST /consolidate`: Accepts `job_id`.
    - Logic: Fetch Raw Data (Supabase) → Run Pipeline → Write Golden Record.
  
  **References**:
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` - Existing callback pattern.
  
  **Acceptance Criteria**:
  - [x] `curl -X POST` triggers the pipeline.
  - [x] Pipeline reads from DB and writes back to DB.

- [x] 8. Verify End-to-End Flow
  **What to do**:
  - Simulate a completed scrape job in DB.
  - Trigger the endpoint.
  - Verify `products_ingestion` has `consolidated` AND `consolidation_metadata`.
  
  **Acceptance Criteria**:
  - [x] Final Record contains merged data.
  - [x] Metadata column contains lineage info.

---

## Commit Strategy

| Task | Message | Files |
|------|---------|-------|
| 1 | `chore(consolidator): init project structure` | `pyproject.toml`, `src/` |
| 2 | `feat(consolidator): add pydantic models` | `src/models/*.py` |
| 3 | `db(schema): add consolidation_metadata` | `supabase/migrations/*.sql` |
| 4 | `feat(consolidator): add normalization logic` | `src/core/normalization.py` |
| 5 | `feat(consolidator): add taxonomy fetcher` | `src/core/taxonomy.py` |
| 6 | `feat(consolidator): add ocr service` | `src/services/ocr.py` |
| 7 | `feat(consolidator): add api endpoint` | `src/api/` |
