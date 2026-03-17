# Scraper Configuration Hardening - Work Plan

**Scope:** All 8 static scraper configs  
**Focus:** No-results detection, multiple-results handling, timeout resilience  
**Status:** Bradley critical fixes applied, remaining work planned below

---

## Current State Summary

### Already Fixed (Bradley - Critical)
- Name selector excludes search page headers
- PDP validation uses product-detail headings
- Removed broken conditional logic
- Click selector prioritizes SKU-matching links

### Critical Gaps Remaining (All Scrapers)

| Scraper | Issue | Risk | Priority |
|---------|-------|------|----------|
| phillips | Missing no-results text patterns (now added) | Medium | P1 |
| petfoodex | Missing no-results text patterns (now added) | Medium | P1 |
| coastal | Weak no-results detection (now expanded) | Medium | P1 |
| amazon | No validate_search_result, clicks blindly | High | P0 |
| mazuri | No validate_search_result, clicks blindly | High | P0 |
| central-pet | Uses required_selectors - verify not brittle | Medium | P2 |
| orgill | No SKU validation on search results | Low | P3 |

---

## Work Plan by Priority

### P0 - Critical (Fix This Week)

#### 1. Amazon - Add Result Validation
**Problem:** Clicks first result without validating it is the correct product  
**Impact:** High - Amazon search returns many related but wrong products  
**Action:** Add validate_search_result between check_no_results and click with required_selectors pointing to PDP-only elements like productTitle  
**Files:** apps/scraper/scrapers/configs/amazon.yaml  
**Estimated Effort:** 30 minutes

#### 2. Mazuri - Add Result Validation
**Problem:** Clicks first result without validation  
**Impact:** High - No SKU/UPC verification before extraction  
**Action:** Add validate_search_result before click with required_selectors for product-single__title or product-single class  
**Files:** apps/scraper/scrapers/configs/mazuri.yaml  
**Estimated Effort:** 30 minutes

---

### P1 - High (Fix This Week)

#### 3. Central-Pet - Verify Selector Robustness
**Problem:** Uses tst_productDetail_erpDescription as required_selector - may be brittle  
**Impact:** Medium - If selector breaks, validation fails  
**Action:** Add fallback selectors like h1 and data-product-detail  
**Files:** apps/scraper/scrapers/configs/central-pet.yaml  
**Estimated Effort:** 20 minutes

#### 4. Orgill - Add SKU Validation
**Problem:** Clicks Ordering Specifications tab without validating search result  
**Impact:** Low-Medium - Could extract wrong product data  
**Action:** Add validate_search_result before click with required_selectors for Description element  
**Files:** apps/scraper/scrapers/configs/orgill.yaml  
**Estimated Effort:** 20 minutes

---

### P2 - Medium (Fix Next Week)

#### 5. Increase Base Timeouts
**Problem:** 15-second timeout too aggressive for slow sites  
**Impact:** Medium - Unnecessary failures on slow connections  
**Action:** Update timeout from 15 to 30 seconds across all configs  
**Files:** All 8 static configs  
**Estimated Effort:** 15 minutes

#### 6. Add Fallback Selectors
**Problem:** Many selectors lack fallbacks - single point of failure  
**Impact:** Medium - Site redesigns break scrapers  
**Action:** Add fallback_selectors to critical fields (Name, Price, Image)  
**Priority Order:** Phillips, Orgill, PetFoodEx, Coastal  
**Estimated Effort:** 1-2 hours

---

## Summary Table

| Task | Scraper | Effort | Priority |
|------|---------|--------|----------|
| Add validate_search_result | amazon | 30m | P0 |
| Add validate_search_result | mazuri | 30m | P0 |
| Expand fallback selectors | central-pet | 20m | P1 |
| Add validate_search_result | orgill | 20m | P1 |
| Increase timeouts | all | 15m | P2 |
| Add fallback selectors | phillips, orgill, petfoodex, coastal | 1-2h | P2 |

**Total Effort:** 3-4 hours  
**Completion Target:** End of week for P0/P1, next week for P2

---

## What Was Already Done

- bradley.yaml: Fixed critical extraction bug (Name selector, PDP validation, click logic)
- phillips.yaml: Added 5 no-results text patterns
- petfoodex.yaml: Added 5 no-results text patterns  
- coastal.yaml: Expanded no-results selectors and patterns

All changes validated via schema validation and live browser testing.
