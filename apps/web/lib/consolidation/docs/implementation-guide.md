# Prompt v1 Production Deployment Guide

This guide walks through deploying Prompt v1 to production safely.

---

## Prerequisites

Before starting deployment, ensure these are in place:

- **Gemini API key configured** - Primary extraction provider
- **OpenAI API key configured** - Fallback for extraction
- **Test environment access** - For validation before production
- **Backup system** - Ability to restore previous version quickly
- **Monitoring dashboards** - Access to consistency and performance metrics

---

## Migration Steps

### Step 1: Backup Current Prompt

Create a backup of the current implementation before making changes:

```bash
# Navigate to consolidation directory
cd apps/web/lib/consolidation

# Create backup
cp prompt-builder.ts prompt-builder.ts.backup

# Document current behavior
# Note: Run baseline tests to capture current metrics
bun test consolidation --reporter=json > pre-deployment-metrics.json
```

**What to document:**

- Current consistency rate (baseline)
- Average response time (baseline)
- Error rate over last 24 hours
- Any known issues or edge cases

---

### Step 2: Update Prompt Function

Replace the `generateSystemPrompt()` function content with Prompt v1:

1. Open `prompt-builder.ts`
2. Locate the `generateSystemPrompt()` function
3. Replace the function body with content from `.sisyphus/drafts/prompt-v1-optimized.txt`
4. Save the file

**Verification:**

```bash
# Verify TypeScript compiles
bun run web type-check

# Run unit tests for prompt builder
bun test prompt-builder
```

---

### Step 3: Test in Staging

Run the full test suite to validate changes:

```bash
# Run consolidation test suite
bun test consolidation

# Run specific Prompt v1 tests
bun test consolidation --testNamePattern="v1"

# Verify 100% consistency maintained
# Expected: All tests pass, no regressions
```

**Checklist:**

- [ ] All existing tests pass
- [ ] Consistency remains at 100%
- [ ] Response times show improvement (~4.4% faster)
- [ ] No new errors introduced

---

### Step 4: Deploy to Production

Deploy during a low-traffic window (recommended: early morning hours):

```bash
# Deploy the updated code
git add apps/web/lib/consolidation/prompt-builder.ts
git commit -m "feat(consolidation): deploy Prompt v1 to production

- Replaces generateSystemPrompt() with optimized Prompt v1
- Maintains 100% consistency
- Improves response time by 4.4%
- Backward compatible"

git push origin main
```

**Post-deployment monitoring (first 24 hours):**

1. Watch error rates for first 30 minutes
2. Check consistency metrics hourly
3. Monitor response time trends
4. Alert if any metric degrades

---

## Rollback Procedure

If issues arise, roll back immediately:

### Immediate Rollback

```bash
# Restore from backup
cd apps/web/lib/consolidation
cp prompt-builder.ts.backup prompt-builder.ts

# Commit rollback
git add prompt-builder.ts
git commit -m "revert(consolidation): roll back Prompt v1 deployment

- Restoring previous prompt version due to [issue]"

git push origin main
```

### Verify Rollback Success

1. Run baseline tests to confirm previous behavior restored
2. Check error rates return to pre-deployment levels
3. Verify consistency metrics stabilize
4. Document rollback reason for post-mortem

---

## Monitoring

Track these metrics after deployment:

### Consistency Metrics

- **Target:** ≥95% consistency maintained
- **Alert threshold:** <90% consistency
- **Check:** Hourly for first 24 hours

### Response Time

- **Expected:** ~4.4% improvement
- **Alert threshold:** >10% degradation
- **Check:** Real-time dashboard

### Error Rates

- **Target:** Near 0%
- **Alert threshold:** >1% error rate
- **Check:** Continuous monitoring

### Dashboard Queries

```sql
-- Consistency rate over time
SELECT 
  date_trunc('hour', created_at) as hour,
  COUNT(*) FILTER (WHERE consistent = true) * 100.0 / COUNT(*) as consistency_pct
FROM consolidation_results
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1;

-- Response time trends
SELECT 
  date_trunc('hour', created_at) as hour,
  AVG(response_time_ms) as avg_response_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time
FROM consolidation_results
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1;
```

---

## Verification

After deployment, complete this verification checklist:

### Immediate Verification (0-1 hour)

- [ ] Deployment successful with no errors
- [ ] Service health checks pass
- [ ] No spike in error rates

### Short-term Verification (1-24 hours)

- [ ] Consistency metrics stable
- [ ] Response times improved as expected
- [ ] Error rates within normal range
- [ ] No customer complaints

### Long-term Verification (1-7 days)

- [ ] Metrics remain stable
- [ ] Performance improvement sustained
- [ ] No regressions detected
- [ ] Cleanup backup file if all good:

```bash
# Remove backup after successful week
rm apps/web/lib/consolidation/prompt-builder.ts.backup
```

---

## Post-Deployment Summary

Document the deployment outcome:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Consistency | 100% | 100% | 0% |
| Response Time | X ms | X ms | -4.4% |
| Error Rate | 0% | 0% | 0% |

**Notes:**

- Deployment date: [YYYY-MM-DD]
- Deployed by: [Name]
- Any issues encountered: [None/Issue details]
- Follow-up actions: [None/Actions needed]

---

## Support Contacts

- **Primary on-call:** [Name/Slack handle]
- **Escalation:** [Name/Slack handle]
- **Monitoring alerts:** [#alerts-consolidation]
