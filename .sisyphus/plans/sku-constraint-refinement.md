# Work Plan: SKU Constraint Refinement (Simplified)

## TL;DR

> **Objective**: Fix the AI Discovery scraper's overly strict SKU validation that rejects valid manufacturer pages when SKUs aren't displayed.
>
> **Core Issue**: Lines 726-731 require SKU text to appear on product page, rejecting 60%+ of valid results.
>
> **Solution**: Accept results when confidence ≥0.8 and brand matches, even without SKU on page.
>
> **Deliverables**:
> - Loosened SKU validation with confidence fallback
> - Simplified query variants (2-3 instead of 6)
> - Rejection logging for debugging
> - Unit tests for new logic
>
> **Estimated Effort**: Small (4-6 hours)
> **Parallel Execution**: Yes - 2 waves
> **Files Modified**: 1-2 Python files

---

## Context

### Current Problem

The `AIDiscoveryScraper` in `BayStateScraper/scrapers/ai_discovery.py` has overly strict validation at lines 726-731:

```python
if sku and not product_name and not brand:
    combined = f"{source_url} {extracted_name} {extracted_brand}..."
    if sku.lower() not in combined:
        return False, "SKU not found in extracted product context"
```

**Impact**: When searching with only an SKU, the scraper REQUIRES the SKU text to appear on the page. Most manufacturer websites don't display SKUs, causing legitimate results to be rejected.

### Data Reality

The discovery system has:
- **SKU**: Product identifier (e.g., "1780013788")
- **Register name**: ALL CAPS, abbreviated (e.g., "PURINA PROPLAN DOG CHKN RICE 40LB")

Brave Search handles ALL CAPS and abbreviations fine. No expansion needed.

---

## Work Objectives

### Core Objective
Modify `_validate_extraction_match()` to accept valid manufacturer pages when confidence is high and brand matches, even if SKU isn't displayed on the page.

### Concrete Deliverables
1. Loosened SKU validation with confidence-based fallback
2. Simplified query variants (remove over-engineered ones)
3. Rejection logging for debugging
4. Unit tests for new validation logic

### Definition of Done
- [ ] SKU validation accepts results when confidence ≥0.8 and brand matches
- [ ] Query variants reduced to 2-3 effective ones
- [ ] All rejections logged with specific reason
- [ ] Unit tests pass
- [ ] Test run shows improved success rate

### Must Have
- Loosened SKU validation logic
- Rejection logging

### Must NOT Have (Guardrails)
- No abbreviation expansion dictionaries
- No complex query variant systems
- No changes to existing successful validation paths
- No breaking changes to DiscoveryResult schema

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Core Fixes - Can Start Immediately):
├── Task 1: Loosen SKU validation with confidence fallback [deep]
├── Task 2: Simplify query variants [quick]
└── Task 3: Add rejection logging [quick]

Wave 2 (Testing - After Wave 1):
├── Task 4: Write unit tests [quick]
└── Task 5: Integration testing [deep]

Wave FINAL (Verification):
├── Task F1: Plan compliance audit (oracle)
└── Task F2: Real manual QA (unspecified-high)

Critical Path: Task 1 → Task 4 → Task 5 → F1-F2
```

---

## TODOs

### Wave 1: Core Fixes

- [x] 1. Loosen SKU Validation

  **What to do**:
  Modify `_validate_extraction_match()` at lines 726-731:
  
  ```python
  # CURRENT (too strict):
  if sku and not product_name and not brand:
      combined = (
          f"{source_url} {extracted_name} {extracted_brand} "
          f"{extraction_result.get('description') or ''} "
          f"{extraction_result.get('size_metrics') or ''}"
      ).lower()
      if sku.lower() not in combined:
          return False, "SKU not found in extracted product context"
  
  # NEW (with fallback):
  if sku and sku.lower() not in combined:
      # Check for strong alternative signals
      has_strong_signals = (
          confidence >= 0.8 and
          extracted_brand and brand and 
          self._is_brand_match(brand, extracted_brand, source_url)
      )
      if not has_strong_signals:
          return False, "SKU not found and weak match signals"
      
      logger.info(
          f"[Discovery Validation] Accepting result without SKU match: "
          f"confidence={confidence:.2f}, brand_match=True, url={source_url}"
      )
  ```

  **Must NOT do**:
  - Don't lower confidence threshold (keep 0.7 default)
  - Don't change brand matching logic
  - Don't remove the check entirely - just add fallback

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2, Task 3)
  - **Blocks**: Task 4, Task 5

  **References**:
  - `scrapers/ai_discovery.py` lines 669-733
  - `_is_brand_match()` method

  **Acceptance Criteria**:
  - [ ] Validation accepts when confidence ≥0.8 and brand matches
  - [ ] Validation still rejects when confidence <0.8
  - [ ] Log message shows acceptance reason

  **QA Scenario**:
  ```python
  # Test: High confidence + brand match
  result = scraper._validate_extraction_match(
      extraction_result={"success": True, "confidence": 0.9, "brand": "Purina", ...},
      sku="12345",
      product_name=None,
      brand="Purina",
      source_url="https://www.purina.com/..."
  )
  # Expected: (True, "ok") even if "12345" not in page
  ```

  **Commit**: 
  - Message: `feat(discovery): loosen SKU validation with confidence fallback`

- [x] 2. Simplify Query Variants

  **What to do**:
  Simplify `_build_query_variants()` to use only effective variants:
  
  ```python
  def _build_query_variants(
      self,
      sku: str,
      product_name: Optional[str],
      brand: Optional[str],
      category: Optional[str],
  ) -> list[str]:
      sku_clean = str(sku or "").strip()
      name_clean = str(product_name or "").strip()
      brand_clean = str(brand or "").strip()
      
      variants: list[str] = []
      
      # Variant 1: SKU only (most effective with minimal data)
      if sku_clean:
          variants.append(f"{sku_clean} product")
      
      # Variant 2: Brand + Name + SKU (when we have more data)
      tokens = [t for t in [brand_clean, name_clean, sku_clean] if t]
      if len(tokens) >= 2:
          variants.append(" ".join(tokens))
      
      # Variant 3: Name + SKU (brand missing)
      if name_clean and sku_clean:
          variants.append(f"{name_clean} {sku_clean}")
      
      # Remove duplicates while preserving order
      seen: set[str] = set()
      deduped: list[str] = []
      for v in variants:
          if v and v not in seen:
              seen.add(v)
              deduped.append(v)
      
      return deduped
  ```

  **Must NOT do**:
  - Don't add more than 3 variants
  - Don't try to expand abbreviations
  - Don't normalize ALL CAPS

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Blocks**: None

  **References**:
  - `scrapers/ai_discovery.py` lines 337-364

  **Acceptance Criteria**:
  - [ ] Maximum 3 variants generated
  - [ ] SKU-only search works
  - [ ] SKU + name search works

  **QA Scenario**:
  ```python
  # Test: Minimal data
  variants = scraper._build_query_variants(
      sku="12345",
      product_name="PURINA CHKN",
      brand=None,
      category=None
  )
  # Expected: ["12345 product", "PURINA CHKN 12345"]
  ```

  **Commit**: 
  - Message: `refactor(discovery): simplify query variants`

- [x] 3. Add Rejection Logging

  **What to do**:
  Add detailed logging at the start of `_validate_extraction_match()`:
  
  ```python
  def _validate_extraction_match(...):
      logger.info(
          f"[Discovery Validation] Validating extraction from {source_url}"
      )
      logger.debug(
          f"  Expected: sku={sku}, brand={brand}, name={product_name}"
      )
      
      # ... validation logic ...
      
      # At each rejection point:
      if not extraction_result.get("success"):
          logger.warning(
              f"[Discovery Validation] REJECTED: extraction failed - {error}"
          )
          return False, error
      
      if confidence < self.confidence_threshold:
          logger.warning(
              f"[Discovery Validation] REJECTED: confidence too low "
              f"({confidence:.2f} < {self.confidence_threshold:.2f})"
          )
          return False, f"Confidence below threshold"
      
      # ... etc for each rejection path
  ```

  **Must NOT do**:
  - Don't log sensitive data (API keys, full HTML)
  - Don't change validation logic (just add logging)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES

  **Acceptance Criteria**:
  - [ ] Each rejection logs specific reason
  - [ ] Acceptance logs confidence and match signals
  - [ ] Consistent `[Discovery Validation]` prefix

  **QA Scenario**:
  ```
  Check logs/discovery_pipeline.log for:
  - "[Discovery Validation] REJECTED: SKU not found and weak match signals"
  - "[Discovery Validation] Accepting result without SKU match: confidence=0.92"
  ```

  **Commit**: 
  - Message: `feat(discovery): add comprehensive rejection logging`

### Wave 2: Testing

- [ ] 4. Write Unit Tests

  **What to do**:
  Create `tests/test_ai_discovery_validation.py`:
  
  ```python
  import pytest
  from scrapers.ai_discovery import AIDiscoveryScraper
  
  @pytest.fixture
  def scraper():
      return AIDiscoveryScraper()
  
  class TestSKUValidation:
      def test_accepts_when_sku_on_page(self, scraper):
          """Original behavior preserved."""
          result = scraper._validate_extraction_match(
              extraction_result={
                  "success": True,
                  "product_name": "Test Product",
                  "brand": "TestBrand",
                  "confidence": 0.9,
              },
              sku="12345",
              product_name=None,
              brand=None,
              source_url="https://example.com/product/12345"
          )
          assert result == (True, "ok")
      
      def test_accepts_without_sku_when_high_confidence_and_brand_match(self, scraper):
          """New: Accept when confidence high and brand matches."""
          result = scraper._validate_extraction_match(
              extraction_result={
                  "success": True,
                  "product_name": "Pro Plan Chicken",
                  "brand": "Purina",
                  "confidence": 0.9,
              },
              sku="12345",  # Not on page
              product_name=None,
              brand="Purina",
              source_url="https://www.purina.com/products/pro-plan-chicken"
          )
          assert result == (True, "ok")
      
      def test_rejects_without_sku_when_low_confidence(self, scraper):
          """New: Reject when confidence too low."""
          result = scraper._validate_extraction_match(
              extraction_result={
                  "success": True,
                  "product_name": "Some Product",
                  "brand": "SomeBrand",
                  "confidence": 0.6,
              },
              sku="12345",
              product_name=None,
              brand="SomeBrand",
              source_url="https://example.com/product"
          )
          assert result[0] == False
          assert "weak match signals" in result[1]
  
  class TestQueryVariants:
      def test_sku_only_generates_single_variant(self, scraper):
          variants = scraper._build_query_variants(
              sku="12345", product_name=None, brand=None, category=None
          )
          assert variants == ["12345 product"]
      
      def test_sku_and_name_generates_two_variants(self, scraper):
          variants = scraper._build_query_variants(
              sku="12345", product_name="PURINA CHKN", brand=None, category=None
          )
          assert len(variants) == 2
          assert "12345 product" in variants
          assert "PURINA CHKN 12345" in variants
  ```

  **Must NOT do**:
  - Don't test external APIs
  - Don't test browser automation

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Wave 1)
  - **Blocks**: Task 5

  **Acceptance Criteria**:
  - [ ] 6+ test cases
  - [ ] All tests pass
  - [ ] Covers new validation logic

  **Commit**: 
  - Message: `test(discovery): add unit tests for validation logic`

- [ ] 5. Integration Testing

  **What to do**:
  Create `scripts/test_discovery_sample.py`:
  
  ```python
  #!/usr/bin/env python3
  """Test discovery on sample products with SKU-only input."""
  import asyncio
  from scrapers.ai_discovery import AIDiscoveryScraper
  
  TEST_PRODUCTS = [
      {"sku": "TEST001", "register_name": "PURINA PROPLAN CHKN 40LB"},
      {"sku": "TEST002", "register_name": "BLUE BUFFALO LAMB RICE 30LB"},
      # Add 3-5 more
  ]
  
  async def main():
      scraper = AIDiscoveryScraper()
      results = []
      
      for product in TEST_PRODUCTS:
          result = await scraper.scrape_product(
              sku=product["sku"],
              product_name=product["register_name"],
              brand=None  # Simulate minimal data
          )
          results.append({
              "sku": product["sku"],
              "success": result.success,
              "confidence": result.confidence,
              "product_found": result.product_name,
              "error": result.error
          })
          print(f"{product['sku']}: {'✓' if result.success else '✗'} "
                f"(confidence: {result.confidence:.2f})")
      
      # Summary
      successful = sum(1 for r in results if r["success"])
      print(f"\nResults: {successful}/{len(results)} successful")
  
  if __name__ == "__main__":
      asyncio.run(main())
  ```

  **Must NOT do**:
  - Don't test more than 5 products (cost)
  - Don't commit real SKU data

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: NO

  **Acceptance Criteria**:
  - [ ] ≥3/5 products successful
  - [ ] Detailed results logged

  **Commit**: 
  - Message: `test(discovery): add integration test script`

---

## Final Verification Wave

### F1. Plan Compliance Audit (oracle)

Verify:
- [ ] SKU validation accepts when confidence ≥0.8 and brand matches
- [ ] Query variants simplified to ≤3
- [ ] All rejections logged
- [ ] Unit tests pass
- [ ] Must NOT HAVE guardrails respected

**Output**: `Must Have [4/4] | Must NOT Have [4/4] | VERDICT`

### F2. Real Manual QA (unspecified-high)

Run integration test and verify:
- [ ] ≥3/5 products successful
- [ ] Logs show clear rejection reasons
- [ ] No regressions

**Output**: `Integration [PASS] | Logs [CLEAR] | VERDICT`

---

## Success Criteria

### Verification Commands
```bash
cd /Users/nickborrello/Desktop/Projects/BayState/BayStateScraper
python -m pytest tests/test_ai_discovery_validation.py -v
python scripts/test_discovery_sample.py
```

### Expected Results
- Unit tests: 6+ tests, all passing
- Integration: ≥60% success rate (vs current ~40%)
- Clear rejection logging
- No regressions

### Final Checklist
- [ ] SKU validation loosened with confidence fallback
- [ ] Query variants simplified
- [ ] Rejection logging added
- [ ] Unit tests pass
- [ ] Integration test shows improvement
- [ ] No breaking changes
