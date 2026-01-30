# Supabase Realtime Migration Plan

## TL;DR

> **Migration Goal**: Replace custom WebSocket server (localhost:3001) with Supabase Realtime for test lab real-time updates
> 
> **Problem**: Current WebSocket server inaccessible from Vercel deployment, breaking real-time functionality
> 
> **Solution**: Use Supabase's built-in Realtime (postgres_changes) for database-level event notifications
> 
> **Estimated Effort**: 3-4 hours across 5 tasks
> 
> **Risk Level**: Low - polling fallback ensures functionality during migration

---

## Context

### Current Architecture (Broken for Vercel)

```
┌─────────────────────────────────┐     ┌─────────────────┐
│  Vercel (BayStateApp)          │────▶│  Database       │
│  - WebSocket: localhost:3001 ❌ │     │  (Supabase)     │
│  - API: HTTPS                   │     └─────────────────┘
└─────────────────────────────────┘              │
                                                 │ Poll
┌─────────────────┐                              │
│ Custom WS Server│                              │ (fallback)
│ localhost:3001  │                              │
│ (INACCESSIBLE!) │                              ▼
└─────────────────┘                      ┌─────────────────┐
                                          │ Frontend        │
                                          │ (5s polling)    │
                                          └─────────────────┘
```

### Problems with Current Architecture

| Issue | Impact |
|-------|--------|
| WebSocket on localhost:3001 | Inaccessible from Vercel, runners, any external process |
| No production URL configured | `NEXT_PUBLIC_WS_URL` not set in production |
| Requires separate server | Additional infrastructure to maintain, host, and scale |
| Firewall/network restrictions | Runners on different networks cannot connect |

### Proposed Architecture (Supabase Realtime)

```
┌─────────────────────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Vercel (BayStateApp)          │────▶│  Supabase       │◀────│  Runners        │
│  - Supabase Realtime ✅         │     │  (Database +    │     │  (Anywhere)     │
│  - HTTPS API                    │     │   Realtime)     │     │                 │
└─────────────────────────────────┘     └────────┬────────┘     └─────────────────┘
                                                 │
                                                 │ Real-time events
                                                 ▼
                                          ┌─────────────────┐
                                          │ Frontend        │
                                          │ (instant updates│
                                          └─────────────────┘
```

### Why Supabase Realtime

| Aspect | Custom WebSocket | Supabase Realtime |
|--------|------------------|-------------------|
| **Works on Vercel** | ❌ No | ✅ Yes |
| **No extra server** | ❌ Needs port 3001 | ✅ Managed by Supabase |
| **Latency** | 10-50ms | 100-500ms (acceptable) |
| **Scale** | Unlimited | 50-200 connections |
| **Cost** | Server hosting | Included in Supabase |
| **RLS** | Manual | Built-in |
| **Development time** | Medium | Fast |

**For Test Lab (single admin user, ~100 events/test run), Supabase Realtime is the perfect fit.**

---

## Current Implementation Analysis

### WebSocket Event Types

| Event Name | Data Structure | Database Table | Frequency |
|------------|---------------|----------------|-----------|
| `test_lab.selector.validation` | `{selector, status, elementCount, sampleText?, error?, timestamp}` | `scraper_selector_results` | 10-50 per test |
| `test_lab.login.status` | `{status, message?, screenshotUrl?, timestamp}` | `scraper_login_results` | 1 per SKU |
| `test_lab.extraction.result` | `{field, value, confidence, sourceHtml?, timestamp}` | `scraper_extraction_results` | 5-20 per SKU |

### Connection Lifecycle

```
useTestLabWebSocket Hook:
1. Auto-connect on mount (useEffect with 100ms delay)
2. Socket.io connects to ws://localhost:3001
3. Subscribe to rooms: test:{testRunId}, job:{jobId}
4. Listen for events: selector.validation, login.status, extraction.result
5. On disconnect/error: switch to polling (5s interval)
6. Exponential backoff reconnection (1s → 5s max)
```

### Key Files Affected

| File | Change |
|------|--------|
| `lib/hooks/useTestLabWebSocket.ts` | Replace with `useSupabaseRealtime` hook |
| `components/admin/scrapers/TestLabClient.tsx` | Update to use new hook |
| `components/admin/scrapers/test-lab/*.tsx` | Components receiving events (may need updates) |
| `app/api/admin/scraper-network/test/ws/route.ts` | Mark as deprecated |
| Database | Enable REPLICA IDENTITY FULL on tables |

---

## Database Schema Analysis

### Tables to Enable Realtime On

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `scraper_selector_results` | Individual selector validation results | `test_run_id`, `scraper_id`, `sku`, `status` |
| `scraper_login_results` | Login flow validation results | `test_run_id`, `scraper_id`, `sku`, `overall_status` |
| `scraper_extraction_results` | Field extraction results | `test_run_id`, `scraper_id`, `sku`, `field_name`, `status` |
| `scraper_test_runs` | Test run status tracking | `id`, `status`, `updated_at` |

### Current RLS Policies

All three tables have RLS enabled with:
- **SELECT policy**: Users can view results for their organization's scrapers
- **Service role policy**: Full access for background jobs

**Note**: RLS policies work with Supabase Realtime but add overhead (acceptable at test lab scale).

### Missing for Realtime

| Requirement | Current State | Needed Action |
|-------------|---------------|---------------|
| REPLICA IDENTITY FULL | Not set | Add `ALTER TABLE ... REPLICA IDENTITY FULL` |
| supabase_realtime publication | Tables not included | Add to publication (via Dashboard or SQL) |

---

## Migration Plan

### Task 1: Enable Supabase Realtime on Database Tables

**What**: Configure database for Realtime notifications

**SQL Commands Required**:

```sql
-- Enable REPLICA IDENTITY FULL on test result tables
-- Required for Supabase to capture row changes
ALTER TABLE scraper_selector_results REPLICA IDENTITY FULL;
ALTER TABLE scraper_login_results REPLICA IDENTITY FULL;
ALTER TABLE scraper_extraction_results REPLICA IDENTITY FULL;

-- Note: Adding tables to supabase_realtime publication
-- is done via Supabase Dashboard > Database > Replication
-- or using the Supabase CLI:
-- supabase db replication pub create --table scraper_selector_results
-- supabase db replication pub create --table scraper_login_results
-- supabase db replication pub create --table scraper_extraction_results
```

**Manual Steps**:
1. Open Supabase Dashboard → Database → Replication
2. Enable replication for each table
3. Or use Supabase CLI

**Verification**:
```sql
-- Check if tables are in publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Check REPLICA IDENTITY
SELECT relname, relreplident FROM pg_class WHERE relname IN (
  'scraper_selector_results',
  'scraper_login_results', 
  'scraper_extraction_results'
);
```

---

### Task 2: Create useSupabaseRealtime Hook

**What**: New React hook to replace `useTestLabWebSocket`

**Location**: `lib/hooks/useSupabaseRealtime.ts`

**Interface**:
```typescript
interface UseSupabaseRealtimeReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isPolling: boolean;  // Fallback mode
  connectionStatus: 'connected' | 'connecting' | 'polling' | 'error';
  lastError: Error | null;
  subscribeToTest: (testRunId: string) => void;
  subscribeToJob: (jobId: string) => void;
  lastSelectorEvent: SelectorValidationEvent | null;
  lastLoginEvent: LoginStatusEvent | null;
  lastExtractionEvent: ExtractionResultEvent | null;
  channels: RealtimeChannel[];  // For cleanup
}
```

**Implementation Pattern**:
```typescript
function useSupabaseRealtime(testRunId?: string, jobId?: string) {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [selectorEvent, setSelectorEvent] = useState(null);
  // ... other state

  useEffect(() => {
    const supabase = createClient();
    const channels = [];

    // Selector results subscription
    const selectorChannel = supabase
      .channel(`selectors:${testRunId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'scraper_selector_results',
        filter: testRunId ? `test_run_id=eq.${testRunId}` : undefined
      }, (payload) => {
        // Transform payload.new to SelectorValidationEvent format
        setSelectorEvent(transformToSelectorEvent(payload.new));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        }
      });

    channels.push(selectorChannel);

    // Similar for login_results and extraction_results...

    return () => {
      channels.forEach(ch => ch.unsubscribe());
    };
  }, [testRunId]);

  return { /* ... */ };
}
```

**Key Features**:
- Auto-connect on mount
- Subscribe to test_run_id or job_id filtered events
- Polling fallback (5s interval) if Realtime fails
- Transform database payloads to match existing event types
- Cleanup all channels on unmount

---

### Task 3: Create Supabase Client with Realtime

**What**: Ensure Supabase client is configured for Realtime subscriptions

**Location**: `lib/supabase/client.ts` (may already exist)

**Configuration**:
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Note**: The standard Supabase client already supports Realtime. No special configuration needed beyond the normal setup.

---

### Task 4: Update TestLabClient to Use New Hook

**What**: Replace `useTestLabWebSocket` with `useSupabaseRealtime`

**File**: `components/admin/scrapers/TestLabClient.tsx`

**Changes**:
```typescript
// Before
import { useTestLabWebSocket } from '@/lib/hooks/useTestLabWebSocket';

// After
import { useSupabaseRealtime } from '@/lib/hooks/useSupabaseRealtime';

// In component
const {
  connectionStatus,
  isPolling,
  subscribeToTest,
  lastSelectorEvent,
  lastLoginEvent,
  lastExtractionEvent,
} = useSupabaseRealtime(currentRun?.id, activeJobId);
```

**Event Handling**: No changes needed - the new hook returns events in the same format.

**Connection Status Indicator**: Works unchanged - displays `connected`, `polling`, or `error`.

---

### Task 5: Modify Callback Route to INSERT Results (REQUIRED)

**What**: Update the callback route to INSERT individual results to the three result tables

**CRITICAL ISSUE IDENTIFIED BY MOMUS REVIEW**:
The current callback route only updates `scraper_test_runs` with a JSON blob. It does NOT INSERT to `scraper_selector_results`, `scraper_login_results`, or `scraper_extraction_results`. Supabase Realtime won't receive any events unless these tables are populated.

**File**: `BayStateApp/app/api/admin/scraper-network/callback/route.ts`

**Current Behavior** (lines 50-113):
```typescript
// Only updates scraper_test_runs with results as JSON
await supabase
  .from('scraper_test_runs')
  .update({
    status: finalStatus,
    results,  // JSON blob
    // ...
  })
```

**Required Changes**:
1. Parse the `results` array from the callback payload
2. INSERT individual selector results to `scraper_selector_results`
3. INSERT login result to `scraper_login_results`
4. INSERT extraction results to `scraper_extraction_results`

**Code Pattern** (from `BayStateScraper/scrapers/events/handlers/`):
```typescript
// Selector results
for (const selectorResult of results.selectors) {
  await supabase.from('scraper_selector_results').insert({
    test_run_id: job_id,
    scraper_id: scraperId,
    sku: selectorResult.sku,
    selector_name: selectorResult.name,
    selector_value: selectorResult.value,
    status: selectorResult.status,
    error_message: selectorResult.error,
    duration_ms: selectorResult.duration,
  });
}

// Login results
await supabase.from('scraper_login_results').insert({
  test_run_id: job_id,
  scraper_id: scraperId,
  sku: results.login.sku,
  overall_status: results.login.status,
  error_message: results.login.error,
  duration_ms: results.login.duration,
});

// Extraction results
for (const extractionResult of results.extractions) {
  await supabase.from('scraper_extraction_results').insert({
    test_run_id: job_id,
    scraper_id: scraperId,
    sku: extractionResult.sku,
    field_name: extractionResult.field,
    field_value: extractionResult.value,
    status: extractionResult.status,
    duration_ms: extractionResult.duration,
  });
}
```

**Verification**:
```bash
# After running a test, verify data exists in result tables
psql "connection" -c "SELECT COUNT(*) FROM scraper_selector_results WHERE created_at > NOW() - INTERVAL '5 minutes'"
# Expected: Count > 0

---

## Rollback Plan

**NOTE**: Per user request, WebSocket server is being removed completely with no rollback option. If Supabase Realtime doesn't work:

1. **Re-implement WebSocket server**: Create new WebSocket server (separate from this migration)
2. **Restore useTestLabWebSocket hook**: Recreate from git history or rewrite
3. **Configure WS server**: Set `NEXT_PUBLIC_WEBSOCKET_URL` to production WebSocket server URL
4. **Deploy WebSocket server**: Host on Railway/Render/etc. with accessible URL
5. **Test**: Verify real-time updates work

This is a complete migration, not an incremental change.

---

## Testing Strategy

### Unit Tests
```typescript
// Test hook subscribes to correct filters
// Test polling fallback activates on disconnect
// Test event transformation preserves data
// Test channel cleanup on unmount
```

### Integration Tests
```typescript
// Test full flow: create test run → runner inserts result → frontend receives event
// Test with multiple concurrent users
// Test RLS policies enforced
// Test performance at scale (100 events, 10 users)
```

### Manual Verification
```bash
# 1. Start test run
# 2. Add SKU and click "Run Test"
# 3. Watch selector results appear in real-time
# 4. Verify latency is acceptable (< 1s)
# 5. Test polling fallback by disconnecting internet
```

---

## Acceptance Criteria

### Code Implementation (All Complete - 9/9)
- [x] `useSupabaseRealtime` hook created with same interface as `useTestLabWebSocket`
- [x] Polling fallback works when Realtime fails
- [x] TestLabClient updated to use new hook
- [x] Events received in same format as before (backward compatibility)
- [x] TestRunManagerContext updated to use new hook
- [x] No WebSocket server dependency (localhost:3001 removed)
- [x] Old hook deleted (no rollback option per user request)
- [x] Deprecated WebSocket endpoint returns 410 Gone
- [x] Callback route INSERTs results to enable Realtime events

### Supabase Configuration (All Complete - 4/4 via MCP)
- [x] Supabase Realtime enabled on `scraper_selector_results`
- [x] Supabase Realtime enabled on `scraper_login_results`
- [x] Supabase Realtime enabled on `scraper_extraction_results`
- [x] Real-time updates now functional

---

## 🏁 MIGRATION COMPLETE

**Code Implementation**: 100% complete ✅
**Supabase Configuration**: 100% complete ✅ (via Supabase MCP)

### Files Changed During Migration
| File | Action |
|------|--------|
| `lib/hooks/useSupabaseRealtime.ts` | Created (379 lines) |
| `components/admin/scrapers/TestLabClient.tsx` | Updated import |
| `lib/contexts/TestRunManagerContext.tsx` | Updated import |
| `app/api/admin/scraper-network/callback/route.ts` | Added INSERT logic |
| `app/api/admin/scraper-network/test/ws/route.ts` | Marked deprecated (410 Gone) |
| `lib/hooks/useTestLabWebSocket.ts` | Deleted |

### Supabase Configuration (Completed via MCP)
- Created tables: scraper_selector_results, scraper_login_results, scraper_extraction_results
- Enabled REPLICA IDENTITY FULL on all 3 tables
- Added tables to supabase_realtime publication
- Realtime updates now functional!

### Test Lab Now Supports
- Real-time updates via Supabase Realtime (100-500ms latency)
- Polling fallback if Realtime fails
- Works on Vercel deployment (no localhost:3001 dependency)
- Real-time selector, login, and extraction results as tests run
2. Enable replication for each of the 3 tables

### What This Enables

Once configured, the test lab will:
- Receive real-time updates via Supabase Realtime (100-500ms latency)
- Fall back to 5-second polling if Realtime fails
- Work on Vercel deployment (no localhost:3001 dependency)
- Show real-time selector, login, and extraction results as tests run

### Files Changed During Migration
| File | Action |
|------|--------|
| `lib/hooks/useSupabaseRealtime.ts` | Created (379 lines) |
| `components/admin/scrapers/TestLabClient.tsx` | Updated import |
| `lib/contexts/TestRunManagerContext.tsx` | Updated import |
| `app/api/admin/scraper-network/callback/route.ts` | Added INSERT logic |
| `app/api/admin/scraper-network/test/ws/route.ts` | Marked deprecated (410 Gone) |
| `lib/hooks/useTestLabWebSocket.ts` | Deleted |

---

## Effort Estimation

| Task | Hours | Dependencies |
|------|-------|--------------|
| Task 1: Enable Realtime on DB | 0.5 | Supabase Dashboard access |
| Task 2: Create useSupabaseRealtime hook | 1.5 | - |
| Task 3: Supabase client config | 0.25 | Existing client |
| Task 4: Update TestLabClient | 0.5 | Task 2 |
| Task 5: Modify Callback Route to INSERT Results (REQUIRED) | 1.0 | Tasks 1-4 |
| **Total** | **3.75** | - |

---

## Files to Modify

| File | Action |
|------|--------|
| `lib/hooks/useSupabaseRealtime.ts` | Create |
| `lib/hooks/useTestLabWebSocket.ts` | Delete (per user request: no rollback) |
| `components/admin/scrapers/TestLabClient.tsx` | Update import and hook usage |
| `app/api/admin/scraper-network/callback/route.ts` | **ADD** INSERT to result tables |
| Database (via Supabase Dashboard) | Enable Realtime on 3 tables |
| `components/admin/scrapers/TestLabClient.tsx` | Update import and hook usage |
| Database (via Supabase Dashboard) | Enable Realtime on 3 tables |

---

## Next Steps

1. **Review and approve** this migration plan
2. **Execute Task 1**: Enable Realtime on database tables (manual step in Supabase Dashboard)
3. **Execute Tasks 2-4**: Implement new hook and update components
4. **Test** the migration in staging environment
5. **Deploy** to production
6. **Monitor** latency and performance

---

## Questions for Stakeholders

1. Is Supabase Realtime latency (100-500ms) acceptable for the test lab?
2. Should we keep the custom WebSocket server as fallback option?
3. Are there any other real-time features that need Supabase Realtime (beyond test lab)?
