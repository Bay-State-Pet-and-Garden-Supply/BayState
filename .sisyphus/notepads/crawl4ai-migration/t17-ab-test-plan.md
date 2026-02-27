# T17: A/B Test Plan - crawl4ai vs browser-use

**Date:** 2026-02-27  
**Task:** T17 - A/B Testing (crawl4ai vs Old)  
**Objective:** Compare crawl4ai and browser-use extraction performance on identical SKU sets

---

## 1. Test Overview

### Purpose
Validate whether crawl4ai provides equivalent or better extraction success rates compared to browser-use while reducing costs and improving speed.

### Hypothesis
crawl4ai will achieve:
- ≥ browser-use success rate (target: >80%)
- Lower cost per extraction (target: <$0.10/page)
- Faster execution time (target: <30s median)

---

## 2. Test Methodology

### Test SKUs (100+ total)

#### Real Product SKUs (from fixtures/test_skus_ground_truth.json)
| Source | Count | Description |
|--------|-------|-------------|
| Scotts | 4 | Lawn & garden products |
| Manna Pro | 6 | Animal feed products |
| Miracle-Gro | 2 | Soil & potting products |
| **Subtotal** | **12** | Ground truth fixtures |

#### Extended SKU List (from config test_skus)
| Config | Count | Description |
|--------|-------|-------------|
| ai-walmart | 5 | Dog food products |
| ai-amazon | 9 | Various pet products |
| ai-mazuri | 5+ | Animal nutrition products |
| **Subtotal** | **19+** | Config-defined test SKUs |

#### Synthetic Test Cases
| Type | Count | Purpose |
|------|-------|---------|
| Fake SKUs | 9 | Test error handling (3 per config) |
| Edge Cases | 6 | Test boundary conditions (2 per config) |
| **Subtotal** | **15** | Negative test cases |

**Total Test SKUs: 46+ (minimum)**

*Note: To reach 100+ SKUs, tests will be run in 3 rounds with variations*

### Test Configurations

| Config | Old System | New System | Site Type |
|--------|------------|------------|-----------|
| ai-walmart | browser-use | crawl4ai | High anti-bot |
| ai-amazon | browser-use | crawl4ai | Moderate complexity |
| ai-mazuri | browser-use | crawl4ai | Simple static |

### Metrics to Capture

1. **Success Rate**
   - Extraction success (all required fields present)
   - Partial success (some fields present)
   - Complete failure (no data extracted)

2. **Performance**
   - Time to first byte (TTFB)
   - Total extraction time
   - Time per field extracted

3. **Cost**
   - LLM tokens consumed
   - API calls made
   - Estimated cost per SKU

4. **Quality**
   - Field accuracy vs ground truth
   - Data completeness score
   - Schema compliance rate

---

## 3. Test Execution Plan

### Phase 1: Parallel Extraction (Days 1-2)
- Run both systems on identical SKU batches
- Capture all metrics in real-time
- Store results with timestamps

### Phase 2: Analysis (Day 3)
- Calculate success rates per system
- Compare cost per successful extraction
- Identify failure patterns

### Phase 3: Decision (Day 4)
- Document go/no-go recommendation
- Create migration plan if approved

---

## 4. Success Criteria

### Go Criteria (ALL must pass)
- [ ] crawl4ai success rate ≥ browser-use success rate
- [ ] crawl4ai cost per extraction < browser-use cost
- [ ] crawl4ai median time ≤ 1.2x browser-use time
- [ ] No critical regressions in data quality

### No-Go Triggers (ANY triggers rejection)
- [ ] crawl4ai success rate < 70%
- [ ] crawl4ai cost > 150% of browser-use
- [ ] crawl4ai has >20% more critical failures
- [ ] Missing critical fields in >30% of extractions

---

## 5. Test Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Test Harness | `tests/t17_ab_test_harness.py` | Execute parallel tests |
| Raw Results | `.sisyphus/evidence/t17-raw-results.json` | Complete test data |
| Comparison Report | `.sisyphus/evidence/t17-ab-test-report.md` | Analysis & decision |
| Findings | `.sisyphus/notepads/crawl4ai-migration/t17-findings.md` | Coordination notes |

---

## 6. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Rate limiting | Implement 3s delays between requests |
| API costs | Cap at $50 per test run |
| Flaky results | Run 3 rounds, use median values |
| Site changes | Use cached HTML fixtures as backup |

---

## 7. Timeline

| Phase | Duration | Output |
|-------|----------|--------|
| Setup | 2 hours | Test harness ready |
| Execution | 4 hours | Raw results captured |
| Analysis | 2 hours | Comparison report |
| Decision | 1 hour | Go/No-go documented |
| **Total** | **9 hours** | Complete assessment |

---

**Test Owner:** Sisyphus-Junior  
**Review Required:** Yes - migration decision  
**Next Task:** T18 (if Go) or remediation plan (if No-Go)
