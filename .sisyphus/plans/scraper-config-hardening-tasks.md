# Scraper Configuration Hardening

**Created:** 2026-03-14  
**Scope:** All 8 static scraper configs  
**Focus:** No-results detection, multiple-results handling, timeout resilience  
**Status:** ✅ ALL TASKS COMPLETE

---

## Summary of Changes

### P0 - Critical (Complete)

- [x] **Bradley**: Fixed critical extraction bug
  - Name selector excludes search page headers
  - PDP validation uses product-detail headings
  - Removed broken conditional logic
  - Click selector prioritizes SKU-matching links

- [x] **Amazon**: Added validate_search_result
  - Uses `#productTitle` PDP-only selector
  - Prevents clicking wrong products

- [x] **Mazuri**: Added validate_search_result
  - Uses `h2.product-single__title` and `.product-single`
  - Prevents blind clicking of first result

### P1 - High (Complete)

- [x] **Central Pet**: Fixed no-results detection
  - Added URL check to detect when still on search page
  - Added fallback selectors: `h1`, `[data-product-detail]`
  - Added specific no-results selectors
  - Fixed "Recommended for You" false positive issue

- [x] **Orgill**: Added validate_search_result
  - Uses Description element, `h1`, `.product-detail`
  - Validates before "Ordering Specifications" tab click

- [x] **Phillips**: Added no-results text patterns
  - 5 patterns added for better no-results detection

- [x] **PetFoodEx**: Added no-results text patterns
  - 5 patterns added for better no-results detection

- [x] **Coastal**: Expanded no-results detection
  - Additional selectors and text patterns

### P2 - Medium (Complete)

- [x] **All 8 configs**: Increased base timeout
  - Changed from 15 seconds to 30 seconds
  - Better resilience for slow sites

- [x] **Phillips**: Added fallback selectors
  - Name: `h1`, `[data-testid='product-name']`
  - Image URLs: `img[src]`, `[data-testid='product-image']`

- [x] **Orgill**: Added fallback selectors
  - Name: `h1`, `[data-product-name]`
  - Price: `.price`, `[class*='price']`
  - Image URLs: `img[src]`, `[data-product-image]`

- [x] **PetFoodEx**: Added fallback selectors
  - Name: `[data-test-selector='product-name']`, `h1`
  - Image URLs: `img[src]`, `[data-test-selector='product-image']`

- [x] **Coastal**: Added fallback selectors
  - Name: `[data-product-title]`, `h1`
  - Price: `.price`, `[class*='price']`, `[data-product-price]`
  - Image URLs: `img[src]`, `[data-product-image]`

---

## Files Modified

All 8 static scraper configs in `apps/scraper/scrapers/configs/`:
1. ✅ bradley.yaml
2. ✅ central-pet.yaml
3. ✅ phillips.yaml
4. ✅ orgill.yaml
5. ✅ petfoodex.yaml
6. ✅ coastal.yaml
7. ✅ mazuri.yaml
8. ✅ amazon.yaml

---

## Validation

- ✅ All configs pass `python3 scripts/validate_configs.py`
- ✅ All configs have timeout: 30
- ✅ All critical scrapers have validate_search_result
- ✅ All target scrapers have fallback selectors
- ✅ All scrapers have comprehensive no-results detection

---

## Impact

| Issue | Before | After |
|-------|--------|-------|
| Bradley extraction bug | Extracted "Search results..." as product name | ✅ Fixed with PDP-specific selectors |
| Amazon blind clicking | Clicked first result without validation | ✅ Validates with #productTitle |
| Mazuri blind clicking | Clicked first result without validation | ✅ Validates with product-single class |
| Central Pet false positives | Recommended products confused with results | ✅ URL check + specific selectors |
| Missing no-results patterns | Empty or minimal patterns | ✅ Comprehensive patterns added |
| Aggressive timeouts | 15 second timeout | ✅ 30 second timeout |
| Brittle selectors | Single point of failure | ✅ Fallback selectors added |

---

## Testing Recommendations

1. Test each scraper with:
   - Valid SKU (should extract correctly)
   - Invalid/fake SKU (should detect no results)
   - Slow connection (timeout should handle gracefully)

2. Monitor for:
   - False positives (wrong products extracted)
   - False negatives (valid products marked as no results)
   - Timeout errors

---

**Total Effort:** ~3-4 hours  
**All Tasks Complete:** ✅  
**Validation Status:** ✅ All configs valid
