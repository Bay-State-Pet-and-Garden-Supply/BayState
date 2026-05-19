# Executor Implementation — ai_only Edge Case

## Change Summary

**File:** `apps/scraper/scrapers/approved_sources/executor.py`

**What:** Added an early check in `execute()` inside the Phase 2 LLM fallback block, right before `_try_official_fallback()` is called. When `self.plan.priority` is empty AND `self._collect_official_domains()` returns an empty list, the method returns a `build_failed_result` with a clear error message instead of trying the fallback with no domains.

**Why:** When the coordinator sends an `ai_only` plan for a brand with no configured domains, the official fallback (`_try_official_fallback()`) would execute with an empty domain list, resulting in a generic failure. The new check surfaces a specific, actionable error: `"AI-only mode requested but no official brand domains are available for this product."`

## Lines Changed

- Lines 96–105 (inserted after existing log, before `official_result = await self._try_official_fallback()`)
- Total: 9 lines added

## Check Logic

```python
if len(self.plan.priority) == 0 and len(self._collect_official_domains()) == 0:
    return build_failed_result(...)
```

- **`self.plan.priority`** — the list of distributor/priority source entries. Empty means no sources were configured.
- **`self._collect_official_domains()`** — aggregates `policy.allowedDomains` + domains from `official_brand` type entries. Empty means no brand domains are known.
- Both must be empty to trigger (if either has entries, the fallback has something to search).

## Validation

- `python3 -m py_compile scrapers/approved_sources/executor.py` — syntax OK
- The check sits inside the `if self._llm_fallback_allowed()` guard, so it only applies when LLM fallback is enabled (the ai_only scenario).

## Execution Flow Before/After

### Before
1. `execute()` → Phase 1: empty/distributor-failed → none
2. Phase 2: `_try_official_fallback()` called
3. `_collect_official_domains()` returns `[]`
4. Official brand adapter gets empty domains → generic failure
5. Returns generic error: "All sources failed and LLM fallback is disabled"

### After
1. `execute()` → Phase 1: empty/distributor-failed → none
2. Phase 2: early check catches `priority=[] AND domains=[]`
3. Returns immediately with: `"AI-only mode requested but no official brand domains are available for this product."`

## Related Code Context

- `_llm_fallback_allowed()` (line 298): returns `plan.llmPolicy.enabled`
- `_collect_official_domains()` (line 304): collects from `policy.allowedDomains` + `official_brand` priority entries
- `_try_official_fallback()` (line 238): builds an official entry from collected domains and runs `crawl4ai_direct` adapter

## Open Risks / Questions

None. Change is narrow, well-scoped, and syntactically verified.
