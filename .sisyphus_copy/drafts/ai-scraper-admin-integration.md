# AI Scraper Admin Panel Integration Plan

## Overview

Integrate the newly created AI scraper capabilities (browser-use powered) into the existing BayStateApp Admin Panel. This will allow administrators to create, configure, test, and monitor AI-powered scrapers alongside traditional CSS-based scrapers.

## Current State Analysis

### Existing Admin Panel Structure
- **Dashboard**: `/admin/scrapers/` - Overview of all scrapers
- **Configs**: `/admin/scrapers/configs/` - List and manage scraper configs
- **Config Editor**: `/admin/scrapers/configs/[id]/edit/` - Edit scraper configurations
- **Studio**: `/admin/scrapers/studio/` - Advanced scraper development environment
- **Test Lab**: `/admin/scrapers/test-lab/` - Test scraper configurations
- **Job History**: `/admin/scrapers/runs/` - View scraper job history
- **Runner Network**: `/admin/scrapers/network/` - Manage distributed runners

### Key Components
- `ConfigEditor` - Main configuration editor with tabs (Metadata, Selectors, Workflow, Advanced, Testing, Preview)
- `WorkflowBuilder` - Visual workflow builder for scraper actions
- `TestLabClient` - Testing interface for scrapers
- `ScraperDashboardClient` - Dashboard with health metrics

### Database Schema
- `scraper_configs` - Main configuration table
- `scraper_config_versions` - Version tracking
- `scraper_health_metrics` - Health monitoring
- New fields needed: `scraper_type`, `ai_config`

## Integration Requirements

### 1. Config Editor UI Updates
**Files to modify:**
- `components/admin/scrapers/configs/tabs/MetadataTab.tsx` - Add scraper_type selector
- `components/admin/scrapers/configs/tabs/ConfigurationTab.tsx` - Add AI config fields
- `lib/admin/scraper-configs/form-schema.ts` - Update form schema

**New Components:**
- `AIConfigPanel` - AI-specific configuration panel
- `ScraperTypeSelector` - Toggle between "static" and "agentic"
- `AIModelSelector` - Select LLM model (gpt-4o-mini, gpt-4o, etc.)
- `CostEstimateDisplay` - Show estimated cost per extraction

### 2. Workflow Builder Updates
**Files to modify:**
- `lib/admin/scrapers/action-definitions.ts` - Add AI action definitions
- `components/admin/scrapers/configs/tabs/WorkflowTab.tsx` - Support AI actions
- `components/admin/scrapers/workflow/ActionNode.tsx` - Render AI action nodes

**New AI Actions:**
- `ai_search` - Brave Search API integration
- `ai_extract` - AI-powered data extraction
- `ai_validate` - Validation with fuzzy matching

### 3. Dashboard Enhancements
**Files to modify:**
- `components/admin/scrapers/ScraperDashboardClient.tsx` - Add AI metrics
- `components/admin/scrapers/ScraperCard.tsx` - Show AI badge

**New Components:**
- `AICostWidget` - Display AI extraction costs
- `AIFallbackStats` - Show fallback statistics
- `AIModelUsageChart` - Chart of LLM model usage
- `AIScraperBadge` - Badge indicating AI scraper type

### 4. Test Lab Integration
**Files to modify:**
- `components/admin/scrapers/test-lab/TestLabClient.tsx` - Support AI testing
- `components/admin/scrapers/test-lab/TestSummaryDashboard.tsx` - Show AI results

**New Components:**
- `AIExtractionResults` - Display AI extraction results with confidence scores
- `AICostBreakdown` - Show cost breakdown for test runs
- `AntiBotDetectionPanel` - Show anti-bot detection results

### 5. API Routes
**New Files:**
- `app/api/admin/scrapers/ai/test/route.ts` - Test AI scraper
- `app/api/admin/scrapers/ai/costs/route.ts` - Get cost estimates
- `app/api/admin/scrapers/ai/fallback-stats/route.ts` - Get fallback statistics

### 6. TypeScript Types & Schemas
**Files to update:**
- `lib/admin/scrapers/types.ts` - Add AI-related types
- `lib/admin/scraper-configs/form-schema.ts` - Add AI config schema

**New Types:**
```typescript
interface AIConfig {
  tool: 'browser-use';
  task: string;
  max_steps: number;
  confidence_threshold: number;
  llm_model: 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4';
  use_vision: boolean;
  headless: boolean;
}

type ScraperType = 'static' | 'agentic';

interface ScraperConfig {
  // ... existing fields
  scraper_type: ScraperType;
  ai_config?: AIConfig;
}
```

## Detailed Implementation Plan

### Phase 1: Foundation (Week 1)

#### Task 1: Update TypeScript Types
- Update `lib/admin/scrapers/types.ts` with AI config types
- Update database types in `lib/supabase/database.types.ts`
- Create migration for new columns (`scraper_type`, `ai_config`)

**Acceptance Criteria:**
- [ ] Types defined for AIConfig, ScraperType
- [ ] Database migration created
- [ ] Form schema updated with AI fields

#### Task 2: Update Config Editor - Metadata Tab
- Add `scraper_type` selector (radio: "Traditional" vs "AI-Powered")
- Show/hide AI config panel based on selection
- Add visual indicators for AI scrapers

**Acceptance Criteria:**
- [ ] Scraper type selector visible in Metadata tab
- [ ] Selecting "AI-Powered" reveals AI config panel
- [ ] Form validation works for both types

#### Task 3: Create AI Config Panel
- Create `AIConfigPanel` component
- Fields: task description, max_steps, confidence_threshold, llm_model, use_vision
- Real-time cost estimation display
- Help text and tooltips

**Acceptance Criteria:**
- [ ] All AI config fields present
- [ ] Cost estimation updates dynamically
- [ ] Helpful descriptions for each field

### Phase 2: Workflow Integration (Week 2)

#### Task 4: Add AI Action Definitions
- Add `ai_search`, `ai_extract`, `ai_validate` to action definitions
- Define action parameters and validation
- Create action icons and descriptions

**Acceptance Criteria:**
- [ ] 3 AI actions defined with proper types
- [ ] Actions appear in workflow builder toolbox
- [ ] Action icons created

#### Task 5: Update Workflow Builder
- Support AI actions in workflow visualization
- Add AI action parameter editors
- Show confidence scores in workflow preview

**Acceptance Criteria:**
- [ ] AI actions can be added to workflows
- [ ] Action parameters editable
- [ ] Workflow validation includes AI actions

#### Task 6: Update YAML Preview
- Ensure AI config serializes to YAML correctly
- Support round-trip editing (YAML <-> Form)
- Validate AI-specific YAML structure

**Acceptance Criteria:**
- [ ] AI config appears in YAML preview
- [ ] YAML can be edited and reloaded
- [ ] Validation catches AI config errors

### Phase 3: Testing & Dashboard (Week 3)

#### Task 7: Test Lab AI Integration
- Update TestLabClient to support AI scrapers
- Display AI extraction results with confidence scores
- Show cost breakdown for test runs

**Acceptance Criteria:**
- [ ] AI scrapers can be tested in Test Lab
- [ ] Results show confidence scores
- [ ] Cost per test displayed

#### Task 8: Create AI Dashboard Widgets
- AICostWidget showing daily/weekly costs
- AIFallbackStats showing fallback rates
- AIModelUsageChart showing model breakdown

**Acceptance Criteria:**
- [ ] Cost widget shows accurate data
- [ ] Fallback stats visible
- [ ] Charts render correctly

#### Task 9: Update Scraper Cards & Badges
- Add AI indicator badge to scraper cards
- Show AI-specific health metrics
- Color-code AI vs traditional scrapers

**Acceptance Criteria:**
- [ ] AI badge visible on scraper cards
- [ ] Health metrics updated for AI
- [ ] Visual distinction clear

### Phase 4: API & Backend (Week 4)

#### Task 10: Create API Routes
- `/api/admin/scrapers/ai/test` - Test AI scraper endpoint
- `/api/admin/scrapers/ai/costs` - Get cost estimates
- `/api/admin/scrapers/ai/fallback-stats` - Get fallback statistics

**Acceptance Criteria:**
- [ ] All API routes functional
- [ ] Proper error handling
- [ ] Rate limiting applied

#### Task 11: Update Server Actions
- Update `lib/admin/scraper-configs/actions.ts`
- Handle AI config in create/update operations
- Add validation for AI-specific fields

**Acceptance Criteria:**
- [ ] Server actions handle AI config
- [ ] Validation works
- [ ] Error messages clear

#### Task 12: Cost Tracking Integration
- Store AI extraction costs in database
- Aggregate costs by scraper/time period
- Display in dashboard

**Acceptance Criteria:**
- [ ] Costs tracked per extraction
- [ ] Aggregated data available
- [ ] Dashboard displays correctly

### Phase 5: Documentation & Polish (Week 5)

#### Task 13: Create AI Scraper Documentation
- Add help panel in config editor
- Create AI scraper guide
- Add tooltips throughout UI

**Acceptance Criteria:**
- [ ] Help content comprehensive
- [ ] Tooltips informative
- [ ] Guide covers common scenarios

#### Task 14: Migration Tool
- Create tool to convert traditional scrapers to AI
- Preserve existing configurations
- Warn about incompatible features

**Acceptance Criteria:**
- [ ] Migration tool functional
- [ ] Data preserved correctly
- [ ] Warnings displayed appropriately

#### Task 15: Final Testing & QA
- End-to-end testing of AI scraper creation
- Test all AI actions in workflow
- Verify cost tracking accuracy
- Performance testing

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] No critical bugs
- [ ] Performance acceptable

## UI/UX Design Specifications

### Scraper Type Selector
```
[Radio Group]
○ Traditional (CSS Selectors)
  Use CSS selectors for structured data extraction
  
● AI-Powered (Browser Agent)
  Use AI to navigate and extract data automatically
  [Best for: JavaScript-heavy sites, complex navigation]
```

### AI Config Panel
```
┌─ AI Configuration ───────────────────┐
│                                       │
│ Task Description                      │
│ [Extract product details from...   ] │
│                                       │
│ Model: [gpt-4o-mini ▼]               │
│ ├─ Cheap & fast ($0.01-0.05/page)    │
│ └─ Good for simple sites             │
│                                       │
│ Max Steps: [10 ▼]                     │
│ └─ Higher = more thorough but slower │
│                                       │
│ Confidence Threshold: [0.7 ▼]        │
│ └─ Minimum confidence to accept data │
│                                       │
│ [✓] Use GPT-4 Vision                 │
│ └─ Better for image-heavy sites      │
│                                       │
│ Estimated Cost: $0.03/page           │
│                                       │
└───────────────────────────────────────┘
```

### AI Action Card (in Workflow Builder)
```
┌─ 🤖 AI Extract ──────────────────────┐
│                                       │
│ Task: Extract product information    │
│                                       │
│ Visit Top: 3 results                 │
│                                       │
│ Schema: name, price, description     │
│                                       │
│ [⚠️ Cost: ~$0.15 per extraction]     │
│                                       │
└───────────────────────────────────────┘
```

### Cost Widget
```
┌─ AI Extraction Costs ────────────────┐
│                                       │
│ Today: $12.45                        │
│ This Week: $89.32                    │
│                                       │
│ By Model:                            │
│ ■ gpt-4o-mini: 85% ($75.92)          │
│ ■ gpt-4o: 15% ($13.40)               │
│                                       │
│ [View Details →]                     │
└───────────────────────────────────────┘
```

## Technical Considerations

### Security
- API keys (OpenAI, Brave) stored securely in environment variables
- Admin-only access to AI scraper features
- Rate limiting on AI test endpoints
- Cost alerts to prevent runaway spending

### Performance
- Lazy load AI config panel
- Debounce cost estimation calculations
- Cache AI action definitions
- Optimize re-renders in workflow builder

### Error Handling
- Graceful fallback if AI services unavailable
- Clear error messages for AI-specific failures
- Retry indicators for anti-bot blocks
- Cost overrun warnings

### Accessibility
- All AI controls keyboard accessible
- Screen reader announcements for cost updates
- High contrast mode support
- Clear focus indicators

## Success Metrics

- **Adoption**: % of new scrapers using AI type
- **Cost Efficiency**: Average cost per extraction
- **Success Rate**: % of AI extractions meeting confidence threshold
- **User Satisfaction**: Admin feedback on AI features
- **Fallback Rate**: % falling back to traditional extraction

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| High AI costs | Hard limits, alerts, cost estimates |
| Anti-bot blocking | Fallback chain, circuit breakers |
| Poor extraction quality | Confidence thresholds, validation |
| User confusion | Extensive documentation, tooltips |
| API failures | Retry logic, fallback modes |

## Future Enhancements

1. **AI-Assisted Scraper Creation**: AI suggests scraper config based on URL
2. **Auto-Selector Generation**: AI generates CSS selectors as hints
3. **Smart Fallback**: ML model predicts which scraper type will work best
4. **Cost Optimization**: AI suggests cheaper models based on site complexity
5. **Batch Processing**: Optimize AI extractions for bulk operations

## Files to Create/Modify

### New Files (10)
1. `components/admin/scrapers/ai/AIConfigPanel.tsx`
2. `components/admin/scrapers/ai/ScraperTypeSelector.tsx`
3. `components/admin/scrapers/ai/AICostWidget.tsx`
4. `components/admin/scrapers/ai/AIFallbackStats.tsx`
5. `components/admin/scrapers/ai/AIModelUsageChart.tsx`
6. `components/admin/scrapers/ai/AIScraperBadge.tsx`
7. `components/admin/scrapers/ai/AIExtractionResults.tsx`
8. `app/api/admin/scrapers/ai/test/route.ts`
9. `app/api/admin/scrapers/ai/costs/route.ts`
10. `lib/admin/scrapers/ai-actions.ts`

### Modified Files (15)
1. `lib/admin/scrapers/types.ts`
2. `lib/admin/scrapers/action-definitions.ts`
3. `lib/admin/scraper-configs/form-schema.ts`
4. `components/admin/scrapers/configs/tabs/MetadataTab.tsx`
5. `components/admin/scrapers/configs/tabs/ConfigurationTab.tsx`
6. `components/admin/scrapers/configs/tabs/WorkflowTab.tsx`
7. `components/admin/scrapers/ScraperCard.tsx`
8. `components/admin/scrapers/ScraperDashboardClient.tsx`
9. `components/admin/scrapers/test-lab/TestLabClient.tsx`
10. `lib/admin/scraper-configs/actions.ts`
11. `lib/supabase/database.types.ts`
12. `components/admin/scrapers/workflow/ActionNode.tsx`
13. `components/admin/scrapers/configs/tabs/PreviewTab.tsx`
14. `components/admin/sidebar.tsx` (add AI indicator)
15. `app/admin/scrapers/page.tsx` (dashboard updates)

## Dependencies

- Existing BayStateApp dependencies
- No new major dependencies required
- Uses existing shadcn/ui components
- Leverages existing Supabase client

## Timeline

**Total Duration**: 5 weeks
- Phase 1 (Foundation): Week 1
- Phase 2 (Workflow): Week 2
- Phase 3 (Testing/Dashboard): Week 3
- Phase 4 (API/Backend): Week 4
- Phase 5 (Documentation/Polish): Week 5

**Parallel Work Possible**: Yes, Phase 3 and 4 can overlap

## Resources Required

- 1 Senior Frontend Developer (React/TypeScript)
- 1 Backend Developer (API/Database)
- 1 UI/UX Designer (for AI-specific components)
- Access to OpenAI API for testing
- Test scrapers for validation

## Conclusion

This integration will bring the power of AI-driven scraping to the existing Admin Panel while maintaining backward compatibility with traditional scrapers. The phased approach ensures incremental delivery and allows for feedback at each stage.

The key to success is:
1. Clear visual distinction between AI and traditional scrapers
2. Transparent cost tracking and controls
3. Comprehensive fallback mechanisms
4. Excellent documentation and user guidance

Ready to begin implementation?
