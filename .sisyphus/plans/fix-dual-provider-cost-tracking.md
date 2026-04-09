# Fix AI Cost Tracking for Dual Providers (Gemini + OpenAI)

## TL;DR

> **Core Objective**: Update cost tracking API and frontend to properly track and display costs for both Gemini and OpenAI providers separately.
>
> **Current Issues**:
> - API only tracks Gemini costs, renames OpenAI to Gemini
> - Frontend assumes single provider
> - No breakdown by provider in dashboard
>
> **Deliverables**:
> - Updated API route with dual provider cost aggregation
> - Updated frontend showing both providers
> - Provider-specific cost breakdown
> - Database query optimization
>
> **Estimated Effort**: Medium (2-3 hours)
> **Parallel Execution**: No - sequential implementation

---

## Context

### Current State
- Database has `provider` column in `batch_jobs` table (added via migration `20260405121500_add_provider_columns_to_batch_jobs.sql`)
- API route (`apps/web/app/api/admin/costs/route.ts`) only aggregates all jobs together
- API renames OpenAI service to "Google Gemini API" causing confusion
- Frontend (`CostTrackingDashboard.tsx`) displays single provider label

### Required Changes
1. **API Layer**: Aggregate costs separately for Gemini and OpenAI
2. **Frontend Layer**: Display both providers with separate cards/tables
3. **Data Structure**: Update interfaces to support dual providers
4. **Service Costs**: Stop renaming OpenAI to Gemini, show both

---

## Work Objectives

### Core Objective
Update cost tracking to properly handle dual AI providers (Gemini + OpenAI) with separate cost aggregation and display.

### Concrete Deliverables
- Updated API route returning costs per provider
- Updated dashboard showing Gemini and OpenAI separately
- Provider-specific summary cards
- Updated job table showing provider column

### Definition of Done
- [x] API returns costs split by provider (Gemini vs OpenAI)
- [x] Frontend displays both providers in separate cards
- [x] Job table shows provider column
- [x] Service costs show both providers without renaming
- [x] Total cost includes both providers

### Must Have
- Separate cost aggregation for Gemini and OpenAI
- Provider column in batch jobs table
- Updated frontend interfaces
- Both providers visible in dashboard

### Must NOT Have
- No breaking changes to existing cost API response structure
- No removal of existing functionality
- No hardcoded API keys

---

## Execution Strategy

### Sequential Tasks

#### Task 1: Update API Route for Dual Provider Cost Aggregation
**File**: `apps/web/app/api/admin/costs/route.ts`

**Changes**:
1. Add `provider` to batch job selection query
2. Split jobs by provider: `gemini` vs `openai`/`openai_compatible`
3. Calculate separate summaries for each provider
4. Add combined totals
5. Remove OpenAI → Gemini renaming logic
6. Update response structure:
   ```typescript
   ai: {
     gemini: { totalCost, totalJobs, promptTokens, ... },
     openai: { totalCost, totalJobs, promptTokens, ... },
     combined: { totalCost, totalJobs, ... },
     recentJobs: [...]
   }
   ```

**Acceptance Criteria**:
- [x] API returns separate cost data for Gemini and OpenAI
- [x] Response includes both individual and combined totals
- [x] Provider column included in recent jobs
- [x] No renaming of OpenAI service to Gemini

#### Task 2: Update Frontend Types and Interfaces
**File**: `apps/web/components/admin/costs/CostTrackingDashboard.tsx`

**Changes**:
1. Update `CostData` interface:
   ```typescript
   ai: {
     gemini: ProviderCostData;
     openai: ProviderCostData;
     combined: CombinedCostData;
     recentJobs: BatchJob[];
   }
   ```
2. Add `provider` field to `BatchJob` interface
3. Create `ProviderCostData` interface

**Acceptance Criteria**:
- [x] TypeScript interfaces updated for dual providers
- [x] No type errors in component

#### Task 3: Update Dashboard UI for Dual Providers
**File**: `apps/web/components/admin/costs/CostTrackingDashboard.tsx`

**Changes**:
1. Replace single AI cost summary card with two cards:
   - "Google Gemini API Costs"
   - "OpenAI API Costs"
2. Add combined total card
3. Update job table to show provider column
4. Update status badges for each provider
5. Update footer note to mention both providers

**UI Changes**:
```typescript
// Summary Cards Section - Replace single AI card with:
<SummaryCard title="Gemini Costs" ... />
<SummaryCard title="OpenAI Costs" ... />
<SummaryCard title="Combined AI Costs" ... />
```

**Acceptance Criteria**:
- [x] Dashboard shows separate cards for Gemini and OpenAI
- [x] Job table includes provider column
- [x] Combined totals calculated correctly
- [x] Visual distinction between providers (colors/icons)

#### Task 4: Update Batch Job Columns
**File**: `apps/web/components/admin/costs/CostTrackingDashboard.tsx`

**Changes**:
1. Add provider column to `batchJobColumns`:
   ```typescript
   {
     key: 'provider',
     header: 'Provider',
     render: (_, row) => (
       <Badge variant={row.provider === 'gemini' ? 'purple' : 'blue'}>
         {row.provider === 'gemini' ? 'Gemini' : 'OpenAI'}
       </Badge>
     )
   }
   ```

**Acceptance Criteria**:
- [x] Provider column visible in job table
- [x] Badges show correct provider names
- [x] Color coding for each provider

#### Task 5: Update Service Costs Display
**File**: `apps/web/components/admin/costs/CostTrackingDashboard.tsx`

**Changes**:
1. Remove `normalizeServiceCostForDisplay` function or update to keep both providers
2. Show OpenAI and Gemini as separate services
3. Update category grouping to handle both

**Acceptance Criteria**:
- [x] Both OpenAI and Gemini appear as separate services
- [x] No renaming/confusion between providers
- [x] Both visible in AI category

#### Task 6: Test End-to-End
**Steps**:
1. Create test batch jobs with both providers
2. Verify API returns correct split
3. Verify dashboard displays correctly
4. Verify totals add up

**Acceptance Criteria**:
- [x] API returns correct provider split
- [x] Dashboard shows both providers
- [x] Costs aggregated correctly
- [x] No console errors

---

## Implementation Files

### Modified Files
1. `apps/web/app/api/admin/costs/route.ts` - API route
2. `apps/web/components/admin/costs/CostTrackingDashboard.tsx` - Frontend component

### No New Files Required

---

## Success Criteria

### Verification
1. **API Test**: 
   ```bash
   curl /api/admin/costs?days=30 | jq '.ai.gemini.totalCost, .ai.openai.totalCost'
   ```
   Expected: Both values returned, sum equals combined total

2. **Frontend Test**:
   - Dashboard shows 3 AI cards (Gemini, OpenAI, Combined)
   - Job table has provider column
   - Both providers visible

3. **Data Integrity**:
   - Gemini jobs have provider='gemini'
   - OpenAI jobs have provider='openai' or 'openai_compatible'
   - Costs calculated correctly per provider

---

## Risks and Mitigation

**Risk**: Breaking existing cost display
- **Mitigation**: Maintain backward compatible response structure

**Risk**: Provider data missing in old jobs
- **Mitigation**: Default to 'openai' for jobs without provider (as per migration)

---

## Next Steps

1. Delegate implementation to task executor
2. Run tests after each task
3. Verify in staging environment
4. Deploy to production
