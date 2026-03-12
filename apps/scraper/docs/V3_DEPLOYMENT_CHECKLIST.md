# V3 Prompt Deployment Checklist

> **Deployment Date:** 2026-03-11  
> **Prompt Version:** v3 (product-focused)  
> **Target:** BayState Scraper Runners  
> **Status:** Ready for Production

---

## 📋 Pre-Deployment Checklist

### 1. Prompt Validation ✅
- [x] v3 prompt file created: `apps/scraper/prompts/extraction_v3.txt`
- [x] Prompt syntax validated (no syntax errors)
- [x] All required sections present:
  - [x] TARGET CONTEXT
  - [x] SKU / VARIANT LOCK
  - [x] BRAND INFERENCE
  - [x] MUST-FILL CHECKLIST
  - [x] SIZE METRICS EXTRACTION
  - [x] CATEGORIES EXTRACTION
  - [x] DESCRIPTION EXTRACTION (improved)
  - [x] IMAGE PRIORITIZATION
- [x] Price/availability sections REMOVED
- [x] File committed to git: `4550dd6`

### 2. Ground Truth Verification ✅
- [x] 10 test SKUs verified in `tests/fixtures/test_skus_ground_truth.json`
- [x] All products have complete data:
  - SKU, brand, name, description, size_metrics, images, categories
- [x] Representative product mix:
  - [x] Scotts products (mulch, spreader)
  - [x] Manna Pro products (feed, treats)
  - [x] Miracle-Gro products (potting mix)

### 3. Evaluation Framework Ready ✅
- [x] Evaluation module: `tests/evaluation/`
- [x] Ground truth loader: `ground_truth_loader.py`
- [x] Field comparator: `field_comparator.py`
- [x] Metrics calculator: `metrics_calculator.py`
- [x] Cost tracker: `cost_tracker.py`
- [x] Report generator: `report_generator.py`
- [x] Evaluation CLI: `scripts/evaluate.py`

### 4. Regression Testing Setup ✅
- [x] Baseline comparator: `baseline_comparator.py`
- [x] Regression tests: `test_prompt_regression.py`
- [x] CI workflow: `.github/workflows/prompt-regression.yml`
- [x] Thresholds config: `config/evaluation_thresholds.yaml`

---

## 🚀 Deployment Steps

### Phase 1: Runner Configuration (5 minutes)

#### 1.1 Verify Environment Variables
```bash
# Check on EACH runner
echo $BRAVE_API_KEY
echo $OPENAI_API_KEY

# Expected:
# BRAVE_API_KEY: YOUR_BRAVE_API_KEY_HERE
# OPENAI_API_KEY: sk-proj-Gtd5tACUtKYC0SrfWBym6Oj8a3kLnvPlHtPk...
```

**Action Required:**
- [ ] Verify API keys set on all runners
- [ ] Verify keys have sufficient quota/credits
- [ ] Test API connectivity from runners

#### 1.2 Verify Dependencies
```bash
# Check on EACH runner
python3 -c "import crawl4ai_engine; print('✓ crawl4ai_engine')"
python3 -c "import openai; print('✓ openai')"
python3 -c "import playwright; print('✓ playwright')"

# Check prompt loading
python3 -c "
from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.matching import MatchingUtils
extractor = Crawl4AIExtractor(
    headless=True,
    llm_model='gpt-4o-mini',
    scoring=SearchScorer(),
    matching=MatchingUtils(),
    prompt_version='v3'
)
print('✓ v3 prompt loads successfully')
"
```

**Action Required:**
- [ ] All dependencies installed on runners
- [ ] Prompt v3 loads without errors
- [ ] No module import errors

#### 1.3 Pull Latest Code
```bash
# On EACH runner
cd /path/to/baystate-scraper
git pull origin master
git log --oneline -3
# Should show: 4550dd6 feat(prompts): add v3 product-focused extraction prompt
```

**Action Required:**
- [ ] Latest code pulled on all runners
- [ ] v3 prompt file present: `apps/scraper/prompts/extraction_v3.txt`

---

### Phase 2: Canary Deployment (10 minutes)

#### 2.1 Deploy to 1 Runner (Canary)
```bash
# Select 1 runner for canary deployment
# Tag runner: "canary-v3"
# Deploy v3 prompt

# Test single extraction
python scripts/evaluate.py \
  --prompt-version v3 \
  --skus 032247886598 \
  --output-dir .sisyphus/evidence/canary-test

# Verify output has:
# - product_name
# - brand
# - description (2+ sentences)
# - size_metrics
# - images
# - categories
# - NO price
# - NO availability
```

**Success Criteria:**
- [ ] Extraction completes without errors
- [ ] All 6 product fields present
- [ ] No price/availability in output
- [ ] Description is 2+ sentences
- [ ] Size metrics normalized (e.g., "1.5 cu ft")

#### 2.2 Monitor Canary (5 minutes)
```bash
# Check logs for errors
tail -f logs/scraper.log | grep -i "v3\|error\|fail"

# Check metrics
cat .sisyphus/evidence/canary-test/*/evaluation-report.json | jq '.aggregate_metrics'
```

**Monitoring Checklist:**
- [ ] No errors in logs
- [ ] Success rate > 80%
- [ ] Extraction time < 5 seconds
- [ ] Cost per extraction reasonable

---

### Phase 3: Rolling Deployment (15 minutes)

#### 3.1 Deploy to 25% of Runners
```bash
# Select 25% of runners
# Deploy v3 to these runners
# Tag: "v3-rollout-25"
```

**Action:**
- [ ] Deploy to 25% of runners
- [ ] Run 5-10 test jobs
- [ ] Monitor for 5 minutes

**Verification:**
- [ ] Success rate > 80%
- [ ] No spike in errors
- [ ] Performance comparable to v2

#### 3.2 Deploy to 50% of Runners
```bash
# If 25% deployment successful
# Deploy to 50% of runners
# Tag: "v3-rollout-50"
```

**Action:**
- [ ] Deploy to 50% of runners
- [ ] Run 10-20 test jobs
- [ ] Monitor for 10 minutes

**Verification:**
- [ ] Success rate > 85%
- [ ] Field accuracy improved vs v2
- [ ] No regressions

#### 3.3 Deploy to 100% of Runners
```bash
# If 50% deployment successful
# Deploy to all remaining runners
# Tag: "v3-production"
```

**Action:**
- [ ] Deploy to 100% of runners
- [ ] Update default prompt version in config
- [ ] Monitor for 30 minutes

**Verification:**
- [ ] All runners using v3
- [ ] Success rate > 90%
- [ ] Overall accuracy > 85%

---

### Phase 4: Configuration Update

#### 4.1 Update Default Config
```yaml
# Update ai-template.yaml
crawler:
  headless: true
  timeout: 30000

ai_config:
  llm_model: "gpt-4o-mini"
  prompt_version: "v3"  # <-- Changed from v2
  max_retries: 3
  
extraction:
  required_fields:
    - product_name
    - brand
    - description
    - size_metrics
    - images
  optional_fields:
    - categories
```

**Action:**
- [ ] Update default prompt version to v3
- [ ] Commit config change
- [ ] Deploy config to all runners

#### 4.2 Update Documentation
```bash
# Update README
sed -i 's/prompt_version: v2/prompt_version: v3/g' README.md

# Update deployment docs
echo "Default prompt: v3 (product-focused)" >> docs/DEPLOYMENT.md
```

**Action:**
- [ ] Update all docs to reference v3
- [ ] Document v3 changes from v2
- [ ] Update troubleshooting guide

---

## 📊 Post-Deployment Verification

### 5.1 Run Full Evaluation
```bash
# Run against all 10 ground truth SKUs
python scripts/evaluate.py \
  --prompt-version v3 \
  --output-dir .sisyphus/evidence/v3-production-validation

# Compare to v2 baseline
python -c "
from tests.evaluation.baseline_comparator import compare
result = compare('v2', 'v3')
print(f'v2 accuracy: {result.baseline_accuracy:.1%}')
print(f'v3 accuracy: {result.challenger_accuracy:.1%}')
print(f'Improvement: {result.improvement:+.1%}')
print(f'Recommendation: {result.recommendation}')
"
```

**Success Criteria:**
- [ ] v3 accuracy > v2 accuracy
- [ ] Improvement statistically significant (p < 0.05)
- [ ] No field regressions > 5%
- [ ] Description field > 75% accuracy
- [ ] Size metrics field > 80% accuracy
- [ ] Categories field > 70% accuracy

### 5.2 Weekly Validation Check
```bash
# Run weekly validation
python scripts/weekly_validation.py \
  --sample-size 20 \
  --prompt-version v3

# Review results
# Expected: Success rate > 85%, field accuracy > 80%
```

**Action:**
- [ ] Weekly validation completes successfully
- [ ] Manual review shows quality improvements
- [ ] No critical issues found

### 5.3 Metrics Dashboard
```bash
# Generate dashboard
python scripts/generate_metrics_dashboard.py

# Review at: .sisyphus/evidence/dashboard/index.html
```

**Verification:**
- [ ] Dashboard shows v3 metrics
- [ ] Time series shows improvement
- [ ] No regression alerts

---

## 🔄 Rollback Plan

### If Issues Detected:

#### Immediate Rollback (< 5 minutes)
```bash
# Emergency rollback to v2
export PROMPT_VERSION=v2

# Or update config
sed -i 's/prompt_version: v3/prompt_version: v2/g' config/ai-template.yaml

# Restart runners
systemctl restart baystate-scraper
```

#### Rollback Criteria:
- [ ] Success rate drops below 70%
- [ ] Any field accuracy drops > 10%
- [ ] Extraction time increases > 50%
- [ ] Cost per SKU increases > 50%
- [ ] Critical errors in logs

#### Rollback Verification:
- [ ] v2 prompt loads successfully
- [ ] Success rate returns to baseline
- [ ] No errors after rollback

---

## 📈 Success Metrics

### Target Metrics (v3 vs v2)

| Metric | v2 Baseline | v3 Target | Status |
|--------|-------------|-----------|--------|
| Overall Accuracy | 51% | 87% | ⬆️ +36% |
| Description | 30% | 80% | ⬆️ +50% |
| Size Metrics | 0% | 85% | ⬆️ +85% |
| Categories | 0% | 75% | ⬆️ +75% |
| Success Rate | 85% | 90% | ⬆️ +5% |
| Cost per SKU | $0.014 | $0.012 | ⬇️ -14% |
| Avg Latency | 2.5s | 2.4s | ⬇️ -4% |

### Post-Deployment Targets:
- [ ] Success rate > 90%
- [ ] Overall accuracy > 85%
- [ ] Description accuracy > 75%
- [ ] Size metrics accuracy > 80%
- [ ] Categories accuracy > 70%
- [ ] No price/availability in output

---

## ✅ Final Sign-Off

**Deployment Completed By:** _________________  
**Date:** _________________  
**Time:** _________________  

### Verification Checklist:
- [ ] All runners using v3 prompt
- [ ] Success rate > 90%
- [ ] No critical errors
- [ ] Metrics improved vs v2
- [ ] Documentation updated
- [ ] Rollback plan tested
- [ ] Team notified

**Notes:**
_________________________________
_________________________________
_________________________________

---

## 📞 Support Contacts

- **Deployment Issues:** DevOps team
- **Prompt Issues:** AI/ML team
- **Runner Issues:** Infrastructure team
- **API Key Issues:** Platform team

**Emergency Rollback:** Run `export PROMPT_VERSION=v2` on all runners

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-11  
**Prompt Version:** v3.0-product-focused
