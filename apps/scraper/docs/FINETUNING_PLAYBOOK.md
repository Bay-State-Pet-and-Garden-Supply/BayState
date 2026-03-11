# Finetuning Playbook for AI Scraper Prompts

This playbook documents the complete 6-step process for systematically improving AI scraper prompts through hypothesis-driven experimentation.

## Table of Contents

1. [Overview](#overview)
2. [Step 1: Identify](#step-1-identify)
3. [Step 2: Hypothesize](#step-2-hypothesize)
4. [Step 3: Implement](#step-3-implement)
5. [Step 4: Test](#step-4-test)
6. [Step 5: Evaluate](#step-5-evaluate)
7. [Step 6: Decide](#step-6-decide)
8. [Concrete Examples](#concrete-examples)
9. [Decision Criteria Reference](#decision-criteria-reference)
10. [Tool Reference](#tool-reference)
11. [Troubleshooting Guide](#troubleshooting-guide)

---

## Overview

Prompt finetuning is a disciplined, data-driven process for improving extraction accuracy. Each change must be validated through controlled experiments with statistical rigor.

### The 6-Step Process

```
IDENTIFY → HYPOTHESIZE → IMPLEMENT → TEST → EVALUATE → DECIDE
    ↑                                                  ↓
    └──────────────── ITERATE IF NEEDED ←─────────────┘
```

### Key Principles

- **Data-driven decisions**: Never merge based on gut feeling
- **Statistical rigor**: Use proper A/B testing with significance testing
- **Documented experiments**: Every hypothesis and result is recorded
- **Reversible changes**: Keep old prompt versions for rollback

---

## Step 1: Identify

### What to Do

Analyze extraction failures to identify patterns worth addressing. Use the pattern analyzer to find the highest-impact issues.

### Commands to Run

```bash
# Analyze failures from the last 7 days
cd apps/scraper
python -m tests.finetuning.pattern_analyzer --days 7

# Run on a schedule to monitor continuously
python -m tests.finetuning.pattern_analyzer --schedule --interval-hours 24

# View the generated report
cat .sisyphus/evidence/failure-pattern-report.json | jq
```

### Expected Outcomes

The pattern analyzer produces a report with:

- **Top failure types**: Categorized by root cause (missing_fields, wrong_product, brand_mismatch, low_confidence, extraction_timeout)
- **Missing field counts**: Which fields are most frequently absent
- **Pattern breakdowns**: Failures grouped by product category, source website, SKU format, and time of day
- **Priority list**: Ranked issues by frequency x impact score
- **Recommendations**: Actionable suggestions based on patterns

### Decision Criteria

Continue to Step 2 if:
- At least 10 failure samples exist for statistical relevance
- A clear pattern emerges (one failure type > 20% of total)
- The issue is addressable through prompt changes (not infrastructure)

Stop and collect more data if:
- Fewer than 10 samples in analysis window
- No dominant pattern (all types < 10%)
- Failures are infrastructure-related (timeouts, network errors)

---

## Step 2: Hypothesize

### What to Do

Form a clear, testable hypothesis about how a prompt change will address the identified issue.

### Hypothesis Format

A good hypothesis follows this structure:

```
IF we [make this specific prompt change]
THEN we expect [this measurable improvement]
BECAUSE [reasoning about why the change helps]
```

### Commands to Run

```bash
# Create a new experiment with your hypothesis
python -m tests.finetuning.hypothesis_tracker create \
  "Adding explicit price normalization rules will improve price accuracy from 10% to 70%" \
  --changes "Added price normalization section with rules for extracting current active variant price and normalizing to single numeric string" \
  --skus "12345,67890,ABC-123" \
  --baseline v1 \
  --challenger v2

# List existing experiments
python -m tests.finetuning.hypothesis_tracker list

# View experiment details
python -m tests.finetuning.hypothesis_tracker get exp_20250310_143022_a1b2c3d4
```

### Expected Outcomes

- An experiment record is created with a unique ID
- The hypothesis is linked to baseline and challenger prompt versions
- Test SKUs are specified for the experiment

### Decision Criteria

Proceed to Step 3 if:
- Hypothesis is specific and measurable
- The change is scoped to one concern (avoid bundled changes)
- Test SKUs cover the failure pattern identified in Step 1

Revise hypothesis if:
- The expected improvement is vague ("better results")
- Multiple unrelated changes are bundled together
- The reasoning does not connect to the identified failure pattern

---

## Step 3: Implement

### What to Do

Create a new prompt version that implements the hypothesized change.

### Versioning Convention

Prompts follow semantic versioning in `prompts/` directory:

```
prompts/
├── extraction_v1.txt    # Baseline
├── extraction_v2.txt    # Current challenger
└── extraction_v3.txt    # New version being created
```

### Implementation Checklist

- Copy the current baseline to a new version file
- Make ONLY the changes specified in your hypothesis
- Document the changes in the file header
- Update `prompts/README.md` with version description

### Commands to Run

```bash
# Create new prompt version
cd apps/scraper/prompts
cp extraction_v1.txt extraction_v2.txt

# Edit the new version with your changes
# (Use your preferred editor)

# Update the experiment with challenger version
python -m tests.finetuning.hypothesis_tracker update \
  exp_20250310_143022_a1b2c3d4 \
  --challenger v2
```

### Expected Outcomes

- A new prompt version file exists with documented changes
- The experiment record is updated with the challenger version
- Changes are isolated to a single concern

### Decision Criteria

Proceed to Step 4 if:
- Prompt changes are complete and tested syntactically
- Changes match the hypothesis exactly
- No unrelated modifications were made

Revise implementation if:
- Additional changes were made beyond the hypothesis
- The prompt has syntax errors
- Changes do not actually address the identified issue

---

## Step 4: Test

### What to Do

Run an A/B test comparing baseline and challenger prompts with statistical rigor.

### Test Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Confidence level | 95% | Statistical confidence for significance |
| Power | 80% | Probability of detecting true effect |
| Min detectable effect | 30% | Smallest improvement worth detecting |
| Max samples | 1000 | Upper limit to prevent runaway tests |

### Commands to Run

```bash
# Run A/B test (synthetic evaluation)
cd apps/scraper
python -c "
from tests.finetuning.ab_test_runner import ABTestRunner
from tests.finetuning.hypothesis_tracker import HypothesisTracker

# Link to hypothesis tracker
tracker = HypothesisTracker()

# Create runner with your tracker
runner = ABTestRunner(
    hypothesis_tracker=tracker,
    min_detectable_effect=0.30,
    power=0.80,
    max_samples=1000,
    interim_step=10
)

# Run the test
result = runner.run_test(
    baseline='v1',
    challenger='v2',
    sample_size=100,
    confidence_level=0.95
)

print(f'Baseline rate: {result.baseline_rate:.2%}')
print(f'Challenger rate: {result.challenger_rate:.2%}')
print(f'Improvement: {result.improvement:.2%}')
print(f'P-value: {result.p_value:.6f}')
print(f'Significant: {result.is_significant}')
print(f'Recommendation: {result.recommendation}')
"

# Start the experiment (mark as running)
python -m tests.finetuning.hypothesis_tracker start exp_20250310_143022_a1b2c3d4
```

### Expected Outcomes

The A/B test produces:

- **Baseline vs Challenger rates**: Success rates for each version
- **Improvement**: Absolute difference in rates
- **P-value**: Statistical significance measure
- **Confidence intervals**: Wilson score intervals for each rate
- **Recommendation**: MERGE, REVIEW, or REJECT

### Decision Criteria

Proceed to Step 5 if:
- Test completed without errors
- Sample size met minimum requirements
- Results are recorded in the experiment tracker

Troubleshoot if:
- Test failed with errors (check logs)
- Sample size insufficient (increase or collect more ground truth)
- Early stopping triggered prematurely

---

## Step 5: Evaluate

### What to Do

Compare results against expectations and check statistical significance.

### Evaluation Dimensions

1. **Primary metric**: Overall extraction success rate
2. **Per-field metrics**: Accuracy for each field (name, brand, price, etc.)
3. **Per-SKU metrics**: Which specific SKUs improved or regressed
4. **Cost impact**: Any changes in extraction cost

### Commands to Run

```bash
# Generate detailed comparison report
cd apps/scraper
python -c "
from tests.evaluation.baseline_comparator import compare
from tests.evaluation.ground_truth_loader import get_all_skus

skus = get_all_skus()
comparison = compare(
    baseline='v1',
    challenger='v2',
    skus=skus,
    confidence_level=0.95
)

print(f'Winner: {comparison.winner}')
print(f'Improvement: {comparison.improvement:.2%}')
print(f'Significant: {comparison.is_significant}')
print(f'Recommendation: {comparison.recommendation}')
print()
print('Per-field deltas:')
for field, delta in comparison.per_field_deltas.items():
    print(f'  {field}: {delta:+.2%}')
"

# View experiment with results
python -m tests.finetuning.hypothesis_tracker get exp_20250310_143022_a1b2c3d4
```

### Expected Outcomes

- A clear winner is identified (or tie declared)
- Statistical significance is determined
- Per-field breakdown shows which fields improved
- Comparison aligns with or contradicts the hypothesis

### Decision Criteria

Proceed to Step 6 with:
- Clear MERGE recommendation (significant improvement)
- Clear REJECT recommendation (significant regression)
- REVIEW recommendation (improvement but not significant)

Collect more data if:
- Results are inconclusive with wide confidence intervals
- Sample size was below required threshold

---

## Step 6: Decide

### What to Do

Make a final decision based on the test results and record the conclusion.

### Decision Actions

| Recommendation | Action | Git Commit |
|----------------|--------|------------|
| MERGE | Promote challenger to new baseline | `feat(prompts): promote v2 to baseline - improved accuracy by X%` |
| REVIEW | Manual review or collect more samples | `docs(prompts): v2 shows promise but needs more data` |
| REJECT | Discard challenger, keep baseline | `chore(prompts): reject v2 - no significant improvement` |

### Commands to Run

```bash
# Record the experiment conclusion
python -m tests.finetuning.hypothesis_tracker complete \
  exp_20250310_143022_a1b2c3d4 \
  accepted    # or 'rejected' or 'inconclusive'

# View updated experiments log
cat prompts/EXPERIMENTS.md
```

### Expected Outcomes

- Experiment is marked complete with conclusion
- EXPERIMENTS.md log is updated with results
- Git commit documents the decision
- Prompt version is either promoted or archived

### Iteration Path

If REJECT or INCONCLUSIVE:
1. Return to Step 2 with a revised hypothesis
2. Or return to Step 1 if the issue requires re-analysis
3. Document learnings in the experiment notes


---

## Concrete Examples

### Example 1: Improving size_metrics Extraction

**Step 1 - Identify**:
```bash
python -m tests.finetuning.pattern_analyzer --days 7
# Report shows: size_metrics missing in 45% of extractions
# Pattern: Mostly affects product pages with tabbed specifications
```

**Step 2 - Hypothesize**:
```bash
python -m tests.finetuning.hypothesis_tracker create \
  "Adding explicit instruction to check tabbed specification sections will improve size_metrics extraction from 55% to 80%" \
  --changes "Added: 'Check tabbed sections (Specifications, Details, Product Info) for size and weight information'" \
  --skus "PROD-001,PROD-002,PROD-003" \
  --baseline v1 \
  --challenger v2
```

**Step 3 - Implement**:
```text
# In prompts/extraction_v2.txt, add:

SPECIFIC EXTRACTION RULES
1) Check visible product details first
2) **Check tabbed sections** (Specifications, Details, Product Info) for size and weight
3) If multiple sizes shown, extract the variant matching the target SKU
```

**Step 4 - Test**:
```python
result = runner.run_test(baseline='v1', challenger='v2', sample_size=100)
# Output:
# Baseline rate: 55.00%
# Challenger rate: 82.00%
# Improvement: +27.00%
# P-value: 0.0012
# Significant: True
# Recommendation: MERGE
```

**Step 5 - Evaluate**:
```python
# Per-field breakdown:
# size_metrics: +27.00% improvement
# name: +2.00% (no regression)
# brand: +0.00% (no regression)
```

**Step 6 - Decide**:
```bash
python -m tests.finetuning.hypothesis_tracker complete exp_20250310_143022_a1b2c3d4 accepted
git add prompts/
git commit -m "feat(prompts): promote v2 to baseline - size_metrics +27% improvement"
```

---

### Example 2: Fixing Price Normalization

**Step 1 - Identify**:
```bash
python -m tests.finetuning.pattern_analyzer --days 7
# Report shows: price accuracy at only 10%
# Pattern: Prices being extracted as ranges or with strike-through MSRP
```

**Step 2 - Hypothesize**:
```bash
python -m tests.finetuning.hypothesis_tracker create \
  "Adding explicit price normalization rules will improve price accuracy from 10% to 70%" \
  --changes "Added PRICE NORMALIZATION section with rules for active variant selection and format normalization" \
  --skus "ITEM-A,ITEM-B,ITEM-C,ITEM-D,ITEM-E" \
  --baseline v2 \
  --challenger v3
```

**Step 3 - Implement**:
```text
# In prompts/extraction_v3.txt, add:

PRICE NORMALIZATION (STRICT)
1) Extract the CURRENT ACTIVE VARIANT price only
2) Ignore strike-through MSRP and crossed-out prices
3) If range shown ($10-$15), extract the selected/active option price
4) Normalize to format: "$XX.XX" (dollar sign + numeric)
5) Return single price string, never ranges
```

**Step 4 - Test**:
```python
result = runner.run_test(baseline='v2', challenger='v3', sample_size=150)
# Output:
# Baseline rate: 12.00%
# Challenger rate: 68.00%
# Improvement: +56.00%
# P-value: 0.0001
# Significant: True
# Recommendation: MERGE
```

**Step 5 - Evaluate**:
```python
# Per-field breakdown:
# price: +56.00% improvement
# name: -1.00% (acceptable variance)
# brand: +0.00% (stable)
```

**Step 6 - Decide**:
```bash
python -m tests.finetuning.hypothesis_tracker complete exp_20250311_092145_b2c3d4e5 accepted
git add prompts/
git commit -m "feat(prompts): v3 fixes price normalization - +56% accuracy improvement"
```

---

### Example 3: Adding New Field Extraction (availability)

**Step 1 - Identify**:
```bash
python -m tests.finetuning.pattern_analyzer --days 7
# Report shows: availability field missing in 70% of extractions
# Pattern: Stock status not being extracted despite being visible on page
```

**Step 2 - Hypothesize**:
```bash
python -m tests.finetuning.hypothesis_tracker create \
  "Adding explicit availability extraction rules with enum normalization will improve availability accuracy from 30% to 75%" \
  --changes "Added AVAILABILITY section with strict enum and precedence order for stock detection" \
  --skus "SKU-1,SKU-2,SKU-3,SKU-4,SKU-5" \
  --baseline v3 \
  --challenger v4
```

**Step 3 - Implement**:
```text
# In prompts/extraction_v4.txt, add:

AVAILABILITY EXTRACTION (STRICT ENUM)
1) Look for stock indicators in this precedence order:
   a) Explicit stock badge/text ("In Stock", "Out of Stock")
   b) Add-to-cart button state
   c) Structured data availability field
2) Normalize to EXACTLY one of:
   - "In Stock"
   - "Out of Stock"
   - "Unknown"
3) Never return free-form text for availability
```

**Step 4 - Test**:
```python
result = runner.run_test(baseline='v3', challenger='v4', sample_size=120)
# Output:
# Baseline rate: 28.00%
# Challenger rate: 73.00%
# Improvement: +45.00%
# P-value: 0.0023
# Significant: True
# Recommendation: MERGE
```

**Step 5 - Evaluate**:
```python
# Per-field breakdown:
# availability: +45.00% improvement
# name: +1.00% (slight improvement)
# brand: +0.00% (stable)
```

**Step 6 - Decide**:
```bash
python -m tests.finetuning.hypothesis_tracker complete exp_20250312_104512_c3d4e5f6 accepted
git add prompts/
git commit -m "feat(prompts): v4 adds availability extraction - +45% accuracy"
```


---

## Decision Criteria Reference

### When to ACCEPT (MERGE)

**Conditions** (ALL must be met):
- Challenger shows statistically significant improvement (p < 0.05)
- No required field shows regression greater than 5%
- Improvement matches or exceeds hypothesis expectation
- Sample size meets minimum threshold

**Action**: Promote challenger to new baseline

### When to REVIEW

**Conditions** (ANY trigger review):
- Improvement is positive but not statistically significant (0.05 less than or equal to p < 0.20)
- Some fields improve while others show minor regression
- Sample size is close to but below threshold
- Results are directionally correct but need more validation

**Actions**:
- Collect more ground truth samples
- Run extended test with larger sample
- Manual review of edge cases
- Consider A/B test in production with feature flag

### When to REJECT

**Conditions** (ANY trigger rejection):
- Challenger shows statistically significant regression (p < 0.05)
- Any required field shows greater than 10% regression
- No improvement despite hypothesis expectation
- Improvement is negative or zero

**Action**: Discard challenger, keep current baseline

### Significance Thresholds

| P-value | Interpretation | Action |
|---------|----------------|--------|
| p < 0.01 | Highly significant | ACCEPT if positive |
| p < 0.05 | Significant | ACCEPT if positive |
| p < 0.10 | Marginally significant | REVIEW |
| p < 0.20 | Trending | REVIEW |
| p >= 0.20 | Not significant | REJECT or iterate |

### Regression Thresholds

| Regression Level | Threshold | Action |
|------------------|-----------|--------|
| Critical | Any required field > 10% | Immediate REJECT |
| Moderate | Required field 5-10% | REVIEW carefully |
| Minor | Required field < 5% | Acceptable if overall positive |
| Optional field | Any amount | Review case by case |

---

## Tool Reference

### Pattern Analyzer

**Location**: `tests/finetuning/pattern_analyzer.py`

**Purpose**: Analyze extraction failures to identify patterns and priorities.

**Key Commands**:
```bash
# One-time analysis
python -m tests.finetuning.pattern_analyzer --days 7

# Scheduled monitoring
python -m tests.finetuning.pattern_analyzer --schedule --interval-hours 24
```

**Output**: `.sisyphus/evidence/failure-pattern-report.json`

---

### Hypothesis Tracker

**Location**: `tests/finetuning/hypothesis_tracker.py`

**Purpose**: Track experiments with hypotheses, results, and conclusions.

**Key Commands**:
```bash
# Create experiment
python -m tests.finetuning.hypothesis_tracker create "hypothesis" --changes "..." --skus "..."

# List experiments
python -m tests.finetuning.hypothesis_tracker list

# Get experiment details
python -m tests.finetuning.hypothesis_tracker get <exp_id>

# Mark experiment complete
python -m tests.finetuning.hypothesis_tracker complete <exp_id> accepted|rejected|inconclusive
```

**Output**: `tests/finetuning/experiments.json`, `prompts/EXPERIMENTS.md`

---

### A/B Test Runner

**Location**: `tests/finetuning/ab_test_runner.py`

**Purpose**: Run statistically rigorous A/B tests between prompt versions.

**Key Classes**:
```python
from tests.finetuning.ab_test_runner import ABTestRunner

runner = ABTestRunner(
    hypothesis_tracker=tracker,
    min_detectable_effect=0.30,
    power=0.80,
    max_samples=1000
)

result = runner.run_test(
    baseline='v1',
    challenger='v2',
    sample_size=100,
    confidence_level=0.95
)
```

**Features**:
- Automatic sample size calculation
- Early stopping for clear winners
- Wilson score confidence intervals
- Two-proportion z-test for significance

---

### Baseline Comparator

**Location**: `tests/evaluation/baseline_comparator.py`

**Purpose**: Compare baseline and challenger with detailed per-field analysis.

**Key Functions**:
```python
from tests.evaluation.baseline_comparator import compare

comparison = compare(
    baseline='v1',
    challenger='v2',
    skus=['SKU-1', 'SKU-2'],
    confidence_level=0.95
)

print(comparison.recommendation)  # MERGE, REVIEW, or REJECT
print(comparison.per_field_deltas)
```

---

### Ground Truth Loader

**Location**: `tests/evaluation/ground_truth_loader.py`

**Purpose**: Load ground truth data for evaluation.

**Key Functions**:
```python
from tests.evaluation.ground_truth_loader import get_ground_truth, get_all_skus

# Get specific product ground truth
product = get_ground_truth('SKU-123')

# Get all available SKUs
all_skus = get_all_skus()
```

---

### Metrics Calculator

**Location**: `tests/evaluation/metrics_calculator.py`

**Purpose**: Calculate accuracy metrics for extraction results.

**Key Functions**:
```python
from tests.evaluation.metrics_calculator import calculate_per_sku_metrics

metrics = calculate_per_sku_metrics(extraction_result, ground_truth)
print(f'Field accuracy: {metrics.field_accuracy:.2%}')
print(f'Required fields success: {metrics.required_fields_success_rate:.2%}')
```

---

## Troubleshooting Guide

### Issue: Pattern analyzer finds no failures

**Symptoms**: Report shows "Insufficient failure samples for analysis"

**Solutions**:
1. Extend analysis window: `--days 14` or `--days 30`
2. Check that evaluation reports exist in `.sisyphus/evidence/`
3. Verify ground truth data is loaded
4. Run evaluations to generate failure data

---

### Issue: A/B test shows "insufficient sample size"

**Symptoms**: Error: "sample_size=X is insufficient; required>=Y"

**Solutions**:
1. Increase sample size in test call
2. Reduce min_detectable_effect if smaller improvements are acceptable
3. Add more SKUs to ground truth dataset
4. Lower confidence level (not recommended below 90%)

---

### Issue: Hypothesis tracker reports duplicate hypothesis

**Symptoms**: Error: "Similar hypothesis already exists"

**Solutions**:
1. Check existing experiments: `python -m tests.finetuning.hypothesis_tracker list`
2. Revise hypothesis to be more specific
3. Use `--allow-duplicates` flag if testing a new variation
4. Build upon previous experiment rather than duplicating

---

### Issue: Early stopping triggers too quickly

**Symptoms**: Test stops after only a few samples

**Solutions**:
1. Increase `interim_step` parameter (default 10)
2. Adjust early stopping thresholds in `ab_test_runner.py`
3. Disable early stopping for critical tests
4. Use larger max_samples to ensure adequate coverage

---

### Issue: Results show high variance

**Symptoms**: Wide confidence intervals, inconsistent per-SKU results

**Solutions**:
1. Increase sample size for better statistical power
2. Check for outliers in ground truth data
3. Ensure SKU diversity covers the failure pattern
4. Consider stratified sampling across product categories

---

### Issue: Baseline cache is stale

**Symptoms**: Comparison uses outdated baseline metrics

**Solutions**:
1. Clear cache: `rm -rf .sisyphus/evidence/baselines/`
2. Re-run evaluation to regenerate
3. Ensure ground truth has not changed significantly

---

### Issue: Prompt changes cause syntax errors

**Symptoms**: Extraction fails with parsing errors

**Solutions**:
1. Validate JSON schema if using structured prompts
2. Check for unescaped special characters
3. Test prompt syntax before running A/B test
4. Keep changes small to isolate issues

---

### Issue: No significant improvement despite clear pattern

**Symptoms**: Pattern analyzer shows issue, but prompts do not improve it

**Solutions**:
1. Re-examine the failure pattern (may be infrastructure, not prompt)
2. Try different prompt approaches (add examples, change structure)
3. Consider if the issue requires schema changes
4. Consult prompt design documentation for best practices

---

## Quick Reference Card

### Command Cheat Sheet

```bash
# 1. IDENTIFY
python -m tests.finetuning.pattern_analyzer --days 7

# 2. HYPOTHESIZE
python -m tests.finetuning.hypothesis_tracker create "..." --changes "..." --skus "..."

# 3. IMPLEMENT
cp prompts/extraction_v1.txt prompts/extraction_v2.txt
# (edit v2.txt with changes)

# 4. TEST
python -c "from tests.finetuning.ab_test_runner import ABTestRunner; ..."

# 5. EVALUATE
python -c "from tests.evaluation.baseline_comparator import compare; ..."

# 6. DECIDE
python -m tests.finetuning.hypothesis_tracker complete <id> accepted|rejected|inconclusive
git add prompts/ && git commit -m "..."
```

### Decision Matrix

| P-value | Improvement | Regression | Decision |
|---------|-------------|------------|----------|
| < 0.05 | Positive | None | ACCEPT |
| < 0.05 | Negative | Any | REJECT |
| 0.05-0.20 | Positive | Minor | REVIEW |
| >= 0.20 | Any | Any | REJECT/iterate |

### Key Metrics to Watch

- **Overall accuracy**: Primary success metric
- **Per-field accuracy**: Catch regressions early
- **Required fields success**: Critical for data quality
- **Sample size**: Ensure statistical validity
- **P-value**: Confirm significance

---

## Additional Resources

- **Prompt Design Guide**: See `docs/prompt_design_v2.md`
- **Prompts README**: See `prompts/README.md`
- **Experiment Log**: See `prompts/EXPERIMENTS.md`
- **Code Reference**: See `tests/finetuning/` directory

---

*Last updated: March 2026*
*Version: 1.0*
