# T20: Gradual Rollout - Findings

## Date: 2026-02-27
## Task: Roll out crawl4ai to remaining scrapers

---

## Current State Discovery

### Active Configs (scrapers/configs/)
| Config | Status | Tool/Provider |
|--------|--------|---------------|
| ai-amazon.yaml | ✅ Migrated | provider: crawl4ai |
| ai-walmart.yaml | ⚠️ Partial | tool: browser-use |
| ai-mazuri.yaml | ⚠️ Partial | tool: browser-use |
| ai-coastal.yaml | ⚠️ Partial | tool: browser-use |
| ai-central-pet.yaml | ⚠️ Partial | tool: browser-use |
| ai-template.yaml | Unknown | TBD |

### Archived Legacy Configs (scrapers/archive/legacy-yaml-configs/)
| Config | AI Config Exists | Needs Migration |
|--------|------------------|-----------------|
| amazon.yaml | ✅ ai-amazon.yaml | ❌ No |
| walmart.yaml | ✅ ai-walmart.yaml | ❌ No |
| mazuri.yaml | ✅ ai-mazuri.yaml | ❌ No |
| coastal.yaml | ✅ ai-coastal.yaml | ❌ No |
| central_pet.yaml | ✅ ai-central-pet.yaml | ❌ No |
| 4health.yaml | ❌ No | ✅ Yes |
| baystatepet.yaml | ❌ No | ✅ Yes |
| bradley.yaml | ❌ No | ✅ Yes |
| orgill.yaml | ❌ No | ✅ Yes |
| petfoodex.yaml | ❌ No | ✅ Yes |
| phillips.yaml | ❌ No | ✅ Yes |

### Summary
- **Total Legacy Configs**: 11
- **Already Migrated to AI**: 5 (have ai-* versions)
- **Remaining to Migrate**: 6 configs need ai-* versions created
- **Need crawl4ai Update**: 4 configs still use browser-use

---

## Batches Planned

### Batch 1 (Test): First 5 configs
1. ai-amazon.yaml (already done - verify)
2. ai-walmart.yaml (update to crawl4ai)
3. ai-mazuri.yaml (update to crawl4ai)
4. ai-coastal.yaml (update to crawl4ai)
5. ai-central-pet.yaml (update to crawl4ai)

### Batch 2: Create AI configs for remaining legacy
1. 4health.yaml → ai-4health.yaml
2. baystatepet.yaml → ai-baystatepet.yaml
3. bradley.yaml → ai-bradley.yaml
4. orgill.yaml → ai-orgill.yaml
5. petfoodex.yaml → ai-petfoodex.yaml
6. phillips.yaml → ai-phillips.yaml

---

## Transpiler Status
- ✅ Transpiler module exists at `lib/transpiler/`
- ✅ CLI available at `transpiler/__main__.py`
- Ready to run migration

---

## Next Steps
1. Run transpiler on legacy configs to create ai-* versions
2. Update existing ai-* configs to use provider: crawl4ai
3. Test and verify success rates
4. Archive any remaining old code
