# Progress Update - Wed Jun  3 22:57:56 EDT 2026
## Fix 7: Complete canonical passthrough at v1 boundaries — DONE
- crawl4ai_extractor.py: Added animal_type, breed_size, primary_protein, diet_type, package_count, package_weight, material to extract_to_v1
- extractor.py: Added packaging_type and color to normalized and product_facts dicts
- enrichment_models.py: Verified build_nested_product_facts handles all 13 canonical fields (already correct)

## Fix 8: Run lint and fix errors — DONE
- Fixed 13 E501 line-length errors (12 in platform_extraction.py, 1 in crawl4ai_extractor.py)
- Bonus: Fixed SyntaxError in enrichment_models.py (llm_used_val bug inside SourceResultInfo constructor)

## Reviewer Fixes (June 3, 2026)

### Fix A: Wire platform schema extraction into actual crawl — DONE
- `crawl4ai_extractor.py`: Changed `_try_platform_schema_extraction` from manual engine init + `engine.crawl(url)` to `async with Crawl4AIEngine(...)` with extraction_strategy in config
- Removed unused import (Crawl4AIEngine as PlatformEngine)
- Resource leak fixed: async context manager handles cleanup automatically

### Fix B: Wire _select_llm_markdown into LLM extraction path — DONE
- Added `_select_llm_markdown()` method to Crawl4AIExtractor (returns rich markdown with spec snippets)
- Added `self._llm_markdown` and `self._llm_input_source` to __init__
- Line 1135: marks now stores both simple markdown (for other consumers) and rich LLM markdown (for LLM calls)
- Both LLM call sites updated to use `self._llm_markdown` instead of `markdown`
- Test updated: `test_completeness_check_passes_good_product` now includes animal_type + flavor to satisfy facet-sparse quality gate

### Validation
- 97/97 scraper tests passing, 6 skipped
- All platform, extractor, adapter fixture, and result builder tests pass

