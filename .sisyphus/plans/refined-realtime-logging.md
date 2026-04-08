# Work Plan: Refined Supabase Realtime Runner Logging

## TL;DR

> **Quick Summary**: Comprehensive rewrite of the janky Supabase Realtime implementation to fix connection issues causing need to refresh page. Removes legacy code, fixes reconnection logic, implements proper error handling, and adds comprehensive testing.
> 
> **Deliverables**:
> - Unified `useRealtimeChannel` hook with proper channel management
> - Fixed RealtimeManager with working reconnection
> - Removed TestLab Socket.io and legacy WebSocket hook
> - Comprehensive test suite (unit + integration)
> - Backward compatibility shim for gradual migration
> 
> **Estimated Effort**: Large (15-20 tasks across 4 waves)
> **Parallel Execution**: YES - 4-5 tasks per wave
> **Critical Path**: Cleanup → Unified Hook → Reconnection Logic → Tests → Final Review

---

## Context

### Original Request
User stated: "Our current implementation of Supabase Realtime and Realtime Logging of our Scraper Runners is janky, and poorly implemented."

**Primary Pain Point**: Need to refresh page to see updates (realtime not working properly)

### Interview Summary
**Key Decisions**:
- Scale: Small (<5 concurrent runners)
- UX Priority: Both live log streaming AND real-time status indicators
- Remove TestLab Socket.io events entirely
- Remove legacy WebSocket hook immediately
- Comprehensive rewrite approach (not incremental)
- Comprehensive testing (unit + integration)
- No special constraints (downtime acceptable, runners can be updated)

### Research Findings

**Current Issues Identified**:

**Scraper Side (apps/scraper/)**:
1. Dead reconnection code (`_auto_reconnect()` never called)
2. Silent broadcast failures (empty try/except)
3. Threading + async mixing (`asyncio.run_coroutine_threadsafe()`)
4. No backpressure handling
5. Three event systems (ScraperEvent, TestLab, Supabase Realtime) not unified
6. TestLab Socket.io disconnected from main flow
7. Shipping thread blocks on API calls
8. Heartbeat only on idle

**Web App Side (apps/web/)**:
1. Legacy `hooks/useRealtimeJobs.ts` coexists with new `lib/realtime/` hooks
2. `useJobBroadcasts` unsubscribe broken
3. No unified channel management
4. No proper reconnection logic
5. Error handling inconsistency
6. Memory management concerns
7. `useRunnerPresence` dependency array issues (infinite loop risk)
8. Missing channel cleanup on unmount
9. No tests for new hooks

**What's Working Well**:
- ✅ Using Broadcast (not postgres_changes) for high-frequency events
- ✅ Filtering at DB level (`job_id=eq.${jobId}`)
- ✅ Proper channel cleanup with `removeChannel`
- ✅ Lazy Supabase client initialization
- ✅ Refs for callback stability

### Metis Review - Additional Gaps Identified

**Critical Issues Found**:
1. **No integration point for `_auto_reconnect`** - disconnect handler missing entirely
2. **Thread safety issues** - mixing `asyncio.Lock` and `threading.Lock`
3. **More pervasive silent failures** - also in `_send_batch` method
4. **Hook dependency arrays worse than thought** - `fetchInitialRunners` causes infinite reconnection loops
5. **Missing channel cleanup on unmount** - memory leaks in `useJobBroadcasts`
6. **Three event systems** (not two) - tight coupling prevents swapping implementations
7. **Database triggers might depend on Realtime** - need to check for cascading failures

**Guardrails Applied**:
- FORBID: Refactoring entire logging system (only fix Realtime transport)
- FORBID: Adding message queue (use bounded queue with drop policy)
- FORBID: Rewriting entire event system (consolidate gradually)
- FORBID: Adding monitoring/alerting (out of scope)
- FORBID: Optimizing performance before correctness

---

## Work Objectives

### Core Objective
Fix the janky Supabase Realtime implementation to eliminate the need to refresh the page to see runner updates. Implement proper reconnection logic, error handling, and channel management while removing dead code.

### Concrete Deliverables
1. **Unified Channel Management**: Single `useRealtimeChannel` hook replacing individual channel creation
2. **Working Reconnection**: RealtimeManager properly reconnects on disconnect with exponential backoff
3. **Proper Error Handling**: No silent failures, proper error propagation
4. **Thread Safety**: Fix asyncio/threading lock mixing
5. **Backward Compatibility Shim**: Legacy hook delegates to new implementation with deprecation warning
6. **Comprehensive Tests**: Unit tests for all hooks, integration tests for full flow
7. **Cleanup**: Remove TestLab Socket.io, legacy WebSocket hook, dead code

### Definition of Done
- [ ] Realtime updates appear in UI without page refresh (verified with end-to-end test)
- [ ] Connection drops are automatically recovered within 35 seconds (5 retry attempts with exponential backoff)
- [ ] No memory leaks after 100 subscribe/unsubscribe cycles (heap snapshot test)
- [ ] All tests pass (unit + integration)
- [ ] Legacy hook works with deprecation warning (backward compatibility)
- [ ] Zero `any` types, zero `@ts-ignore`, zero `console.log`

### Must Have
- Unified channel management to prevent duplicate subscriptions
- Proper reconnection with exponential backoff (max 5 attempts)
- Error handling with connection state exposure (`connecting` | `connected` | `disconnected` | `error`)
- Backpressure handling for log queue (bounded queue with drop policy)
- Thread-safe shipping thread
- Channel cleanup on component unmount
- Comprehensive test coverage (80%+)

### Must NOT Have (Guardrails)
- NO refactoring of entire logging system (only Realtime transport)
- NO adding new infrastructure (Redis, message queues)
- NO rewriting entire event system (gradual consolidation only)
- NO adding monitoring/alerting (out of scope)
- NO performance optimization before correctness
- NO infinite retry loops (max 5 attempts with backoff)
- NO `console.log` or `print()` statements (structured logging only)
- NO breaking changes without migration path (backward compatibility shim required)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest + React Testing Library in web app, pytest in scraper)
- **Automated tests**: YES (TDD approach - RED → GREEN → REFACTOR for each task)
- **Framework**: Jest + RTL for web, pytest for scraper
- **Test Strategy**: 
  - Unit tests for individual hooks/functions
  - Integration tests for end-to-end flow
  - Heap snapshot tests for memory leak detection
  - TDD: Write failing test first, then implementation

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

**Verification Methods**:
- **Frontend**: Playwright - Open admin dashboard, verify realtime updates appear without refresh
- **Scraper**: Bash (tmux) - Run scraper, simulate disconnect, verify reconnection
- **API**: Bash (curl) - Test backward compatibility shim endpoints

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Cleanup - Start Immediately):
├── Task 1: Remove TestLab Socket.io server and events
├── Task 2: Create backward compatibility shim for legacy hook
└── Task 3: Write tests for backward compatibility

Wave 2 (Core Hooks - After Wave 1):
├── Task 4: Create unified useRealtimeChannel hook (TDD: RED phase)
├── Task 5: Implement channel pooling and lifecycle management
├── Task 6: Add connection state management and error handling
└── Task 7: Write comprehensive unit tests for unified hook

Wave 3 (Scraper Refactor - After Wave 2):
├── Task 8: Fix RealtimeManager reconnection (integrate _auto_reconnect)
├── Task 9: Implement thread-safe shipping with backpressure
├── Task 10: Add proper error handling (remove silent failures)
└── Task 11: Write scraper integration tests

Wave 4 (Web App Refactor - After Wave 2):
├── Task 12: Refactor useJobBroadcasts to use unified channel
├── Task 13: Fix useRunnerPresence dependency array issues
├── Task 14: Fix useLogSubscription and useJobSubscription
└── Task 15: Write unit tests for refactored hooks

Wave 5 (Integration & Polish - After Waves 3 & 4):
├── Task 16: Write end-to-end integration tests
├── Task 17: Memory leak detection tests (heap snapshots)
├── Task 18: Remove legacy WebSocket hook entirely
└── Task 19: Final cleanup and documentation

Wave FINAL (Review - After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (Remove TestLab) | - | 8 |
| 2 (Compat Shim) | - | 18 |
| 3 (Compat Tests) | 2 | - |
| 4 (Unified Hook) | - | 5, 6, 7 |
| 5 (Channel Pooling) | 4 | 8 |
| 6 (Connection State) | 4 | 12, 13, 14 |
| 7 (Unit Tests) | 4 | - |
| 8 (RealtimeManager) | 1, 5 | 16 |
| 9 (Thread Safety) | 8 | 16 |
| 10 (Error Handling) | 8 | 16 |
| 11 (Scraper Tests) | 9, 10 | - |
| 12 (useJobBroadcasts) | 6 | 16 |
| 13 (useRunnerPresence) | 6 | 16 |
| 14 (useLogSubscription) | 6 | 16 |
| 15 (Hook Tests) | 12, 13, 14 | - |
| 16 (E2E Tests) | 8, 12, 13, 14 | 17 |
| 17 (Memory Tests) | 16 | - |
| 18 (Remove Legacy) | 2, 16 | - |
| 19 (Documentation) | All | - |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks → `quick` (cleanup tasks)
- **Wave 2**: 4 tasks → `unspecified-high` (complex hook logic)
- **Wave 3**: 4 tasks → `deep` (threading/async issues)
- **Wave 4**: 4 tasks → `unspecified-high` (hook refactoring)
- **Wave 5**: 4 tasks → `deep` (integration testing)
- **FINAL**: 4 tasks → Mixed (`oracle`, `unspecified-high`, `unspecified-high`, `deep`)

---

## TODOs


- [x] 1. Remove TestLab Socket.io server and events

  **What to do**:
  - Delete `/apps/scraper/scrapers/events/` directory (entire directory - all files are TestLab-specific)
  - Delete test files:
    - `apps/scraper/tests/test_websocket_server.py`
    - `apps/scraper/tests/test_integration.py`
    - `apps/scraper/tests/test_events.py`
    - `apps/scraper/tests/test_event_handlers.py`
    - `apps/scraper/tests/test_runner_events.py`
    - `apps/scraper/tests/test_websocket_server.py`
    - `apps/scraper/tests/test_integration.py`
  - Remove TestLab imports from all scraper files
  - Update any documentation referencing TestLab
  
  **Must NOT do**:
  - Do NOT modify Supabase Realtime-related code
  - Do NOT change the main daemon flow
  - Do NOT touch `core/events.py` ScraperEvent system
  
  **Recommended Agent Profile**:
  - **Category**: `quick` (cleanup tasks, file deletions, import removals)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Task 8 (RealtimeManager refactor)
  
  **References**:
  - `apps/scraper/scrapers/events/websocket_server.py` - Socket.io server to remove
  - `apps/scraper/scrapers/events/websocket_server.py:75` - TestLabWebSocketServer class (lines 75-205)
  - `apps/scraper/scrapers/events/` - Directory to delete
  
  **Acceptance Criteria**:
  - [ ] TestLab directory and files completely removed
  - [ ] No imports of TestLab modules anywhere in codebase
  - [ ] `bun run web build` and `cd apps/scraper && python -m pytest` both pass
  - [ ] Scraper still runs without errors (test with `python daemon.py --env dev` locally)
  
  **QA Scenarios**:
  ```
  Scenario: Verify TestLab removal doesn't break scraper
    Tool: Bash
    Preconditions: Scraper environment set up
    Steps:
      1. Run: cd apps/scraper && python daemon.py --env dev --dry-run
      2. Verify: No ImportError for missing TestLab modules
      3. Verify: Daemon starts successfully
    Expected Result: Scraper starts without TestLab-related errors
    Evidence: .sisyphus/evidence/task-1-scraper-start.log
  ```
  
  **Commit**: YES
  - Message: `chore(scraper): remove TestLab Socket.io server and events`
  - Files: All deleted files + modified imports


- [x] 2. Create backward compatibility shim for legacy hook

  **What to do**:
  - REPLACE `/apps/web/hooks/useRealtimeJobs.ts` with a shim that wraps new implementation
  - The shim REPLACES the legacy implementation (same file path, new content)
  - Shim should:
    - Import from `lib/realtime/useJobBroadcasts`
    - Map legacy options to new options
    - Log deprecation warning: `[DEPRECATED] useRealtimeJobs is deprecated. Use useJobBroadcasts`
    - Delegate all calls to new implementation
  - Save a backup of the legacy implementation first (for reference in Task 18)
  - Ensure shim has same TypeScript signature as original
  - Create `/apps/web/hooks/useRealtimeJobs.ts` shim that wraps new implementation
  - Shim should:
    - Import from `lib/realtime/useJobBroadcasts`
    - Map legacy options to new options
    - Log deprecation warning: `[DEPRECATED] useRealtimeJobs is deprecated. Use useJobBroadcasts`
    - Delegate all calls to new implementation
  - Ensure shim has same TypeScript signature as original
  
  **Must NOT do**:
  - Do NOT change any existing imports
  - Do NOT break any existing functionality
  - Do NOT delete the backup of legacy implementation yet (needed for Task 18 verification)
  
  **Recommended Agent Profile**:
  - **Category**: `quick` (compatibility layer, simple delegation)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Task 18 (Remove legacy hook)
  
  **References**:
  - `apps/web/hooks/useRealtimeJobs.ts` - Current legacy implementation
  - `apps/web/lib/realtime/useJobBroadcasts.ts` - New implementation to wrap
  - `apps/web/lib/realtime/types.ts` - Types for mapping
  
  **Acceptance Criteria**:
  - [ ] Shim file created at `apps/web/hooks/useRealtimeJobs.ts`
  - [ ] Shim imports from `lib/realtime/useJobBroadcasts`
  - [ ] Shim logs deprecation warning on first use
  - [ ] All existing usage of `useRealtimeJobs` still works (no breaking changes)
  - [ ] TypeScript compiles without errors
  
  **QA Scenarios**:
  ```
  Scenario: Verify backward compatibility shim works
    Tool: Bash
    Preconditions: Web app builds successfully
    Steps:
      1. Run: bun run web build
      2. Verify: No TypeScript errors
      3. Verify: Shim file exists and imports from lib/realtime/useJobBroadcasts
    Expected Result: Build passes, shim properly delegates to new implementation
    Evidence: .sisyphus/evidence/task-2-build-success.log
  ```
  ```
  Scenario: Verify backward compatibility shim works
    Tool: Bash
    Preconditions: Web app builds successfully
    Steps:
      1. Run: bun run web build
      2. Verify: No TypeScript errors
      3. Verify: Shim properly imports and re-exports from lib/realtime
    Expected Result: Build passes, deprecation warning logged
    Evidence: .sisyphus/evidence/task-2-build-success.log
  ```
  
  **Commit**: YES
  - Message: `feat(web): add backward compatibility shim for useRealtimeJobs`
  - Files: `apps/web/hooks/useRealtimeJobs.ts` (new shim)


- [x] 3. Write tests for backward compatibility shim

  **What to do**:
  - Write unit tests for the backward compatibility shim
  - Test that:
    - Shim delegates to new implementation correctly
    - Deprecation warning is logged
    - Legacy options are mapped correctly
    - Error handling propagates correctly
  
  **Must NOT do**:
  - Do NOT test the new implementation itself (that's Task 7)
  - Do NOT modify existing tests
  
  **Recommended Agent Profile**:
  - **Category**: `quick` (unit tests)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocked By**: Task 2
  
  **References**:
  - `apps/web/__tests__/hooks/useRealtimeJobs.test.ts` - Existing legacy tests (reference only)
  - `apps/web/hooks/useRealtimeJobs.ts` (shim from Task 2)
  
  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/__tests__/hooks/useRealtimeJobs.shim.test.ts`
  - [ ] All tests pass: `bun run web test __tests__/hooks/useRealtimeJobs.shim.test.ts`
  - [ ] Coverage for deprecation warning
  - [ ] Coverage for option mapping
  
  **QA Scenarios**:
  ```
  Scenario: Verify shim tests pass
    Tool: Bash
    Preconditions: Task 2 completed
    Steps:
      1. Run: bun run web test __tests__/hooks/useRealtimeJobs.shim.test.ts
      2. Verify: All tests pass (0 failures)
    Expected Result: Test suite passes with 100% success rate
    Evidence: .sisyphus/evidence/task-3-test-results.log
  ```
  
  **Commit**: YES (group with Task 2)
  - Message: `test(web): add tests for useRealtimeJobs shim`
  - Files: `apps/web/__tests__/hooks/useRealtimeJobs.shim.test.ts`


- [x] 4. Create unified useRealtimeChannel hook (TDD: RED phase)

  **What to do**:
  - Create `/apps/web/lib/realtime/useRealtimeChannel.ts`
  - This hook provides unified channel management
  - Features:
    - Channel pooling (reuse channels for same name)
    - Connection state tracking
    - Error handling
    - Automatic cleanup on unmount
    - Exponential backoff for reconnection
  - Write the test file FIRST (TDD RED phase)
  - Tests should initially FAIL (since implementation doesn't exist yet)
  
  **Interface design**:
  ```typescript
  interface UseRealtimeChannelOptions {
    channelName: string;
    onMessage: (payload: any) => void;
    onError?: (error: Error) => void;
    autoConnect?: boolean;
  }
  
  interface UseRealtimeChannelReturn {
    connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
    lastError: Error | null;
    reconnectAttempt: number;
    connect: () => void;
    disconnect: () => void;
  }
  ```
  
  **Must NOT do**:
  - Do NOT implement the hook yet (just write tests and skeleton)
  - Do NOT touch existing hooks
  
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (complex hook design)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Tasks 5, 6, 7
  
  **References**:
  - `apps/web/lib/realtime/useJobBroadcasts.ts` - Reference for broadcast handling
  - `apps/web/lib/realtime/useRunnerPresence.ts` - Reference for presence handling
  - Supabase docs: https://supabase.com/docs/guides/realtime
  
  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/__tests__/lib/realtime/useRealtimeChannel.test.ts`
  - [ ] Tests written for all interface methods
  - [ ] Tests initially FAIL (RED phase of TDD)
  - [ ] Skeleton hook file created with TypeScript types
  
  **QA Scenarios**:
  ```
  Scenario: Verify TDD RED phase
    Tool: Bash
    Steps:
      1. Run: bun run web test __tests__/lib/realtime/useRealtimeChannel.test.ts
      2. Verify: Tests fail (expected for RED phase)
    Expected Result: Test failures confirm RED phase
    Evidence: .sisyphus/evidence/task-4-red-phase.log
  ```
  
  **Commit**: YES
  - Message: `test(web): add useRealtimeChannel tests (TDD RED phase)`
  - Files: Test file + skeleton hook


- [x] 5. Implement channel pooling and lifecycle management

  **What to do**:
  - Implement the channel pooling logic in `useRealtimeChannel.ts`
  - Features:
    - Single channel instance per channelName (shared across components)
    - Reference counting for subscriptions
    - Automatic cleanup when last subscriber unsubscribes
    - Proper `removeChannel` on unmount
  - Use a module-level Map to store channel instances
  - Implement `getOrCreateChannel(channelName)` helper
  
  **Key implementation details**:
  ```typescript
  // Module-level channel store
  const channelPool = new Map<string, ChannelPoolEntry>();
  
  interface ChannelPoolEntry {
    channel: RealtimeChannel;
    refCount: number;
    subscribers: Set<string>; // subscriber IDs
  }
  ```
  
  **Must NOT do**:
  - Do NOT implement connection state yet (Task 6)
  - Do NOT implement error handling yet (Task 6)
  - Do NOT modify existing hooks
  
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (complex state management)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocked By**: Task 4
  - **Blocks**: Task 8 (RealtimeManager)
  
  **References**:
  - `apps/web/lib/realtime/useJobBroadcasts.ts` lines 245-302 - Channel creation pattern
  - `apps/web/lib/realtime/useRunnerPresence.ts` lines 215-250 - Channel lifecycle
  
  **Acceptance Criteria**:
  - [ ] Channel pooling implemented with Map storage
  - [ ] Reference counting working correctly
  - [ ] Channel reused when same name requested
  - [ ] Channel removed when refCount reaches 0
  - [ ] Tests pass: `bun run web test __tests__/lib/realtime/useRealtimeChannel.test.ts` (GREEN phase)
  
  **QA Scenarios**:
  ```
  Scenario: Verify channel pooling works
    Tool: Bash
    Steps:
      1. Run: bun run web test __tests__/lib/realtime/useRealtimeChannel.test.ts --testNamePattern="pooling"
      2. Verify: All pooling tests pass
    Expected Result: Pooling logic works correctly
    Evidence: .sisyphus/evidence/task-5-pooling-tests.log
  ```
  
  **Commit**: YES
  - Message: `feat(web): implement channel pooling in useRealtimeChannel`
  - Files: `apps/web/lib/realtime/useRealtimeChannel.ts`


- [ ] 6. Add connection state management and error handling

  **What to do**:
  - Implement connection state tracking:
    - `'connecting'` → `'connected'` → `'disconnected'` | `'error'`
  - Add exponential backoff for reconnection:
    - Delays: 1000ms, 2000ms, 4000ms, 8000ms, 16000ms
    - Max 5 reconnection attempts
    - After max attempts, stay in `'error'` state
  - Add error handling:
    - `lastError` state
    - `onError` callback
    - Structured error logging (no `console.log`)
  
  **State machine**:
  ```
  disconnected -> connecting -> connected
                         |
                         v
                      error (after max retries)
  ```
  
  **Must NOT do**:
  - Do NOT use `console.log` (use structured logging)
  - Do NOT retry forever (must have max attempts)
  - Do NOT modify existing hooks
  
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (state machine logic)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocked By**: Task 4
  - **Blocks**: Tasks 12, 13, 14
  
  **References**:
  - `apps/web/lib/realtime/useJobBroadcasts.ts` lines 254-266 - Status handling
  - Supabase Realtime docs on connection states
  
  **Acceptance Criteria**:
  - [ ] Connection state transitions work correctly
  - [ ] Exponential backoff implemented with correct delays
  - [ ] Max 5 reconnection attempts enforced
  - [ ] Error state properly tracked and exposed
  - [ ] Tests pass including error scenarios
  
  **QA Scenarios**:
  ```
  Scenario: Verify reconnection with backoff
    Tool: Bash
    Steps:
      1. Run: bun run web test __tests__/lib/realtime/useRealtimeChannel.test.ts --testNamePattern="reconnection"
      2. Verify: Backoff delays match spec (1s, 2s, 4s, 8s, 16s)
      3. Verify: Stops after 5 attempts
    Expected Result: Reconnection logic works as specified
    Evidence: .sisyphus/evidence/task-6-reconnection-tests.log
  ```
  
  **Commit**: YES
  - Message: `feat(web): add connection state and error handling`
  - Files: `apps/web/lib/realtime/useRealtimeChannel.ts`


- [ ] 7. Write comprehensive unit tests for unified hook

  **What to do**:
  - Complete test coverage for `useRealtimeChannel`:
    - Channel pooling (multiple subscribers, cleanup)
    - Connection state transitions
    - Reconnection with exponential backoff
    - Error handling and propagation
    - Cleanup on unmount
    - Memory leak prevention
  - Mock Supabase client for tests
  - Use React Testing Library for hook testing
  
  **Test categories**:
  1. Pooling tests (reference counting, shared channels)
  2. Connection state tests (transitions, status updates)
  3. Reconnection tests (backoff, max attempts, error state)
  4. Error handling tests (callbacks, state updates)
  5. Lifecycle tests (mount, unmount, cleanup)
  6. Integration tests (multiple hooks, interaction)
  
  **Must NOT do**:
  - Do NOT test Supabase internals (just our wrapper)
  - Do NOT add tests for existing hooks (only unified hook)
  
  **Recommended Agent Profile**:
  - **Category**: `quick` (writing tests)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocked By**: Task 4
  
  **References**:
  - `apps/web/__tests__/hooks/useRealtimeJobs.test.ts` - Example test patterns
  - React Testing Library docs for hook testing
  
  **Acceptance Criteria**:
  - [ ] Test coverage >= 80% for `useRealtimeChannel.ts`
  - [ ] All tests pass: `bun run web test __tests__/lib/realtime/useRealtimeChannel.test.ts`
  - [ ] Tests cover all edge cases (reconnection, errors, cleanup)
  - [ ] No test timeouts or flakiness
  
  **QA Scenarios**:
  ```
  Scenario: Verify comprehensive test coverage
    Tool: Bash
    Steps:
      1. Run: bun run web test __tests__/lib/realtime/useRealtimeChannel.test.ts --coverage
      2. Verify: Coverage >= 80%
      3. Verify: All tests pass
    Expected Result: Full test coverage, all green
    Evidence: .sisyphus/evidence/task-7-coverage-report.log
  ```
  
  **Commit**: YES (group with Tasks 5-6)
  - Message: `test(web): add comprehensive tests for useRealtimeChannel`
  - Files: `apps/web/__tests__/lib/realtime/useRealtimeChannel.test.ts`


- [ ] 8. Fix RealtimeManager reconnection (integrate _auto_reconnect)

  **What to do**:
  - Fix the dead `_auto_reconnect()` method in `apps/scraper/core/realtime_manager.py`
  - Current issue: Method exists (lines 504-529) but is never called
  - Integration points needed:
    1. Call `start_reconnection_loop()` on connection failure
    2. Wire into disconnect handler
    3. Ensure reconnection doesn't create duplicate channels
  - Add disconnect detection in `connect()` method
  - Implement proper exponential backoff (same as web: 1s, 2s, 4s, 8s, 16s)
  - Add max 5 reconnection attempts
  
  **Key changes**:
  ```python
  # In connect() method, add disconnect handler:
  def _on_disconnect():
      self.is_connected = False
      self.start_reconnection_loop()
  
  # Modify _auto_reconnect to use backoff:
  async def _auto_reconnect(self):
      backoff = [1, 2, 4, 8, 16]  # seconds
      for attempt, delay in enumerate(backoff):
          await asyncio.sleep(delay)
          if await self.connect():
              return
      logger.error("Max reconnection attempts exceeded")
  ```
  
  **Must NOT do**:
  - Do NOT change the public API
  - Do NOT break existing runner compatibility
  - Do NOT use blocking operations in async context
  
  **Recommended Agent Profile**:
  - **Category**: `deep` (Python async, complex logic)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Tasks 1 (TestLab removal), 5 (channel pooling concept)
  - **Blocks**: Task 16 (E2E tests)
  
  **References**:
  - `apps/scraper/core/realtime_manager.py` lines 504-529 - `_auto_reconnect` method
  - `apps/scraper/core/realtime_manager.py` lines 99-140 - `connect()` method
  - `apps/scraper/utils/logging_handlers.py` - How RealtimeManager is used
  
  **Acceptance Criteria**:
  - [ ] `start_reconnection_loop()` is called on disconnect
  - [ ] Exponential backoff implemented correctly
  - [ ] Max 5 attempts enforced
  - [ ] No duplicate channel creation on reconnection
  - [ ] Scraper tests pass: `cd apps/scraper && python -m pytest tests/ -v` (TestLab tests removed)
  
  **QA Scenarios**:
  ```
  Scenario: Verify reconnection works in scraper
    Tool: Bash (tmux)
    Preconditions: Scraper running in one pane
    Steps:
      1. Start scraper: python daemon.py --env dev
      2. Simulate network disconnect (iptables or disconnect WiFi)
      3. Wait 30 seconds
      4. Restore network
      5. Verify: Scraper reconnects and resumes broadcasting
    Expected Result: Automatic reconnection within 5 attempts
    Evidence: .sisyphus/evidence/task-8-reconnection-test.log
  ```
  
  **Commit**: YES
  - Message: `feat(scraper): fix RealtimeManager reconnection logic`
  - Files: `apps/scraper/core/realtime_manager.py`


- [ ] 9. Implement thread-safe shipping with backpressure

  **What to do**:
  - Fix thread safety issues in `JobLogTransport` in `apps/scraper/utils/logging_handlers.py`
  - Current problem: Mixing `asyncio.Lock` and `threading.Lock`
  - Implement proper thread-safe queue using `asyncio.Queue` for async context
  - Add backpressure handling:
    - Bounded queue (max 1000 entries = ~10MB)
    - Drop oldest logs when queue is full (not newest)
    - Log warning when dropping
  - Fix `_send_batch` to not silently fail
  
  **Implementation**:
  ```python
  # Replace threading lock with asyncio-compatible approach
  self._queue = asyncio.Queue(maxsize=1000)  # Bounded queue
  
  async def _shipping_loop(self):
      while True:
          try:
              batch = await asyncio.wait_for(self._queue.get(), timeout=1.0)
              await self._send_batch_async(batch)
          except asyncio.TimeoutError:
              continue
  
  def _on_queue_full(self, entry):
      # Drop oldest (FIFO eviction)
      dropped = self._queue.get_nowait()
      logger.warning(f"Queue full, dropped oldest log: {dropped['message'][:50]}")
      self._queue.put_nowait(entry)
  ```
  
  **Must NOT do**:
  - Do NOT introduce new infrastructure (Redis, etc.)
  - Do NOT change the public API
  - Do NOT use blocking `queue.put()` (will deadlock)
  
  **Recommended Agent Profile**:
  - **Category**: `deep` (Python async, thread safety)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Task 8 (RealtimeManager changes)
  - **Blocks**: Task 16 (E2E tests)
  
  **References**:
  - `apps/scraper/utils/logging_handlers.py` lines 158-498 - JobLogTransport
  - `apps/scraper/utils/logging_handlers.py` lines 335-362 - `_send_batch`
  
  **Acceptance Criteria**:
  - [ ] Thread safety fixed (no mixing of lock types)
  - [ ] Bounded queue implemented (max 1000)
  - [ ] Backpressure policy: drop oldest when full
  - [ ] Warning logged when logs are dropped
  - [ ] No silent failures in `_send_batch`
  - [ ] All scraper tests pass
  
  **QA Scenarios**:
  ```
  Scenario: Verify backpressure handling
    Tool: Python REPL
    Preconditions: Scraper imports available
    Steps:
      1. Create transport with small queue (10 entries)
      2. Queue 15 entries rapidly
      3. Verify: Only 10 entries in queue
      4. Verify: Warning logged for 5 dropped entries
    Expected Result: Oldest logs dropped, warning emitted
    Evidence: .sisyphus/evidence/task-9-backpressure.log
  ```
  
  **Commit**: YES
  - Message: `fix(scraper): add thread-safe shipping with backpressure`
  - Files: `apps/scraper/utils/logging_handlers.py`


- [ ] 10. Add proper error handling (remove silent failures)

  **What to do**:
  - Fix all silent failures identified:
    1. `JobLogTransport.broadcast()` - empty try/except (lines 395-397)
    2. `JobLogTransport._send_batch()` - silent requeue (lines 335-362)
    3. `RealtimeManager.broadcast_job_log()` - no error propagation
  - Add structured error logging (use `logger.error` not `console.log`)
  - Implement circuit breaker pattern:
    - After 5 consecutive failures, stop retrying temporarily
    - Resume after 60 seconds
  - Propagate errors to caller where appropriate
  
  **Changes needed**:
  ```python
  # Before (silent):
  try:
      self.realtime_manager.broadcast_job_log_entry(payload)
  except Exception:
      pass  # Silent!
  
  # After (structured):
  try:
      await self.realtime_manager.broadcast_job_log_entry(payload)
  except RealtimeError as e:
      logger.error("Failed to broadcast log", extra={
          "job_id": entry.job_id,
          "error": str(e),
          "will_retry": self._should_retry(e)
      })
      if self._should_retry(e):
          self._schedule_retry(entry)
  ```
  
  **Must NOT do**:
  - Do NOT use bare `except:` (always catch specific exceptions)
  - Do NOT change error types in public API
  - Do NOT add `print()` statements
  
  **Recommended Agent Profile**:
  - **Category**: `deep` (error handling, Python)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Task 8
  - **Blocks**: Task 16
  
  **References**:
  - `apps/scraper/utils/logging_handlers.py` lines 395-397 - Silent broadcast
  - `apps/scraper/core/realtime_manager.py` - Error propagation
  
  **Acceptance Criteria**:
  - [ ] No empty `except:` blocks
  - [ ] All errors logged with structured context
  - [ ] Circuit breaker implemented
  - [ ] Error state exposed to caller
  - [ ] Tests verify error handling
  
  **QA Scenarios**:
  ```
  Scenario: Verify error handling
    Tool: Bash
    Steps:
      1. Run unit tests: python -m pytest tests/unit/test_job_logging_transport.py -v
      2. Verify: Tests for error scenarios pass
      3. Check logs: grep "ERROR" test output
    Expected Result: Errors properly logged, no silent failures
    Evidence: .sisyphus/evidence/task-10-error-handling.log
  ```
  
  **Commit**: YES
  - Message: `fix(scraper): add proper error handling, remove silent failures`
  - Files: `apps/scraper/utils/logging_handlers.py`, `apps/scraper/core/realtime_manager.py`


- [ ] 11. Write scraper integration tests

  **What to do**:
  - Write integration tests for scraper Realtime flow:
    - Test: End-to-end log flow from JobLogTransport → RealtimeManager → broadcast
    - Test: Reconnection scenario
    - Test: Backpressure scenario
    - Test: Error recovery
  - Mock Supabase client for tests
  - Use pytest-asyncio for async tests
  
  **Test scenarios**:
  1. "should broadcast logs to Supabase Realtime"
  2. "should reconnect after connection drop"
  3. "should drop old logs when queue is full"
  4. "should stop retrying after max attempts"
  5. "should resume after circuit breaker cooldown"
  
  **Must NOT do**:
  - Do NOT test actual Supabase connection (mock it)
  - Do NOT modify production code for tests
  
  **Recommended Agent Profile**:
  - **Category**: `quick` (writing tests)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Tasks 9, 10
  
  **References**:
  - `apps/scraper/tests/unit/test_job_logging_transport.py` - Existing tests
  - `apps/scraper/docs/ARCHITECTURE.md` - System architecture
  
  **Acceptance Criteria**:
  - [ ] Test file: `apps/scraper/tests/integration/test_realtime_integration.py`
  - [ ] All tests pass: `python -m pytest tests/integration/test_realtime_integration.py -v`
  - [ ] Coverage for reconnection, backpressure, errors
  
  **QA Scenarios**:
  ```
  Scenario: Verify integration tests
    Tool: Bash
    Steps:
      1. Run: cd apps/scraper && python -m pytest tests/integration/test_realtime_integration.py -v
      2. Verify: All tests pass
    Expected Result: Integration test suite passes
    Evidence: .sisyphus/evidence/task-11-integration-tests.log
  ```
  
  **Commit**: YES (group with Tasks 8-10)
  - Message: `test(scraper): add integration tests for Realtime flow`
  - Files: `apps/scraper/tests/integration/test_realtime_integration.py`


- [ ] 12. Refactor useJobBroadcasts to use unified channel

  **What to do**:
  - Refactor `apps/web/lib/realtime/useJobBroadcasts.ts` to use `useRealtimeChannel`
  - Replace individual channel creation with unified hook
  - Fix the broken unsubscribe (currently requires recreating channel)
  - Ensure proper cleanup on unmount
  
  **Refactoring plan**:
  ```typescript
  // Before: Creates own channel
  const channel = supabase.channel(channelName);
  channel.subscribe();
  
  // After: Uses unified hook
  const { connectionState, connect, disconnect } = useRealtimeChannel({
    channelName,
    onMessage: handleBroadcast,
    onError: handleError,
  });
  ```
  
  **Must NOT do**:
  - Do NOT change the public API (same interface)
  - Do NOT break existing functionality
  - Do NOT modify other hooks yet (Tasks 13-14)
  
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (hook refactoring)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocked By**: Task 6 (connection state), Task 8 (scraper changes)
  - **Blocks**: Task 16
  
  **References**:
  - `apps/web/lib/realtime/useJobBroadcasts.ts` - Current implementation
  - `apps/web/lib/realtime/useRealtimeChannel.ts` - Unified hook (Tasks 4-7)
  
  **Acceptance Criteria**:
  - [ ] `useJobBroadcasts` uses `useRealtimeChannel` internally
  - [ ] Unsubscribe works correctly (no channel recreation needed)
  - [ ] Cleanup on unmount works
  - [ ] All existing tests pass
  - [ ] TypeScript compiles without errors
  
  **QA Scenarios**:
  ```
  Scenario: Verify refactored useJobBroadcasts
    Tool: Bash
    Steps:
      1. Build: bun run web build
      2. Verify: No TypeScript errors
      3. Verify: Jest unit tests pass (test file created in Task 15)
    Expected Result: Refactored hook compiles correctly
    Evidence: .sisyphus/evidence/task-12-refactor.log
  ```
  ```
  Scenario: Verify refactored useJobBroadcasts
    Tool: Bash
    Steps:
      1. Run: bun run web test __tests__/lib/realtime/useJobBroadcasts.test.ts
      2. Verify: All tests pass
      3. Build: bun run web build
      4. Verify: No TypeScript errors
    Expected Result: Refactored hook works correctly
    Evidence: .sisyphus/evidence/task-12-refactor.log
  ```
  
  **Commit**: YES
  - Message: `refactor(web): use unified channel in useJobBroadcasts`
  - Files: `apps/web/lib/realtime/useJobBroadcasts.ts`


- [ ] 13. Fix useRunnerPresence dependency array issues

  **What to do**:
  - Fix `useRunnerPresence.ts` dependency array issues identified by Metis
  - Current problem: `fetchInitialRunners` causes infinite reconnection loops
  - Fix: Stabilize callback references using `useRef` or `useCallback` with empty deps
  - Add missing dependencies: `fetchInitialRunners`, `connect`, `disconnect`
  
  **Root cause**:
  ```typescript
  // Problem: onPresenceChange changes on every render
  const fetchInitialRunners = useCallback(async () => {
      // uses onPresenceChange
  }, [supabase, onPresenceChange]);
  
  // This causes effect to re-run infinitely
  useEffect(() => {
      init();
  }, [fetchInitialRunners, /* ... */]);
  ```
  
  **Fix using refs**:
  ```typescript
  const callbacksRef = useRef({ onPresenceChange });
  useEffect(() => {
      callbacksRef.current = { onPresenceChange };
  }, [onPresenceChange]);
  
  const fetchInitialRunners = useCallback(async () => {
      const { onPresenceChange } = callbacksRef.current;
      // ... use onPresenceChange
  }, [supabase]); // Remove onPresenceChange from deps
  ```
  
  **Must NOT do**:
  - Do NOT use `eslint-disable` to suppress warnings
  - Do NOT just add deps blindly (causes infinite loops)
  - Do NOT change the public API
  
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (React hooks, dependency management)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocked By**: Task 6
  - **Blocks**: Task 16
  
  **References**:
  - `apps/web/lib/realtime/useRunnerPresence.ts` lines 369-388 - Effect with problematic deps
  - `apps/web/lib/realtime/useJobBroadcasts.ts` lines 152-161 - Callback ref pattern (good example)
  
  **Acceptance Criteria**:
  - [ ] All ESLint warnings resolved
  - [ ] No infinite reconnection loops (test with 100 renders)
  - [ ] `fetchInitialRunners` not in effect dependency array
  - [ ] Callbacks stabilized using ref pattern
  - [ ] All tests pass
  
  **QA Scenarios**:
  ```
  Scenario: Verify no infinite loops
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Run: bun run web test:a11y:e2e --grep="runner-presence"
      2. Verify: Test waits 60s without excessive reconnection logs
      3. Verify: Console has no "connecting..." spam messages
      4. Verify: WebSocket connections stable (no rapid reconnect)
    Expected Result: Stable connection, no reconnection loops
    Evidence: .sisyphus/evidence/task-13-no-loops.png (screenshot)
  ```
  
  **Commit**: YES
  - Message: `fix(web): resolve useRunnerPresence dependency array issues`
  - Files: `apps/web/lib/realtime/useRunnerPresence.ts`


- [ ] 14. Fix useLogSubscription and useJobSubscription

  **What to do**:
  - Apply same fixes to remaining hooks:
    - `useLogSubscription.ts` - fix any dependency issues
    - `useJobSubscription.ts` - fix memory leaks, dependency issues
  - Add proper channel cleanup on unmount
  - Fix filter logic (move to channel level if possible)
  
  **Issues to address**:
  1. `useLogSubscription` - missing cleanup tracking
  2. `useJobSubscription` - `maxJobsPerStatus` but unbounded total
  3. Both - ensure `removeChannel` called on unmount
  
  **Must NOT do**:
  - Do NOT change public APIs
  - Do NOT remove existing functionality
  
  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (hook refactoring)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocked By**: Task 6
  - **Blocks**: Task 16
  
  **References**:
  - `apps/web/lib/realtime/useLogSubscription.ts` - Log subscription hook
  - `apps/web/lib/realtime/useJobSubscription.ts` - Job subscription hook (529 lines)
  
  **Acceptance Criteria**:
  - [ ] All hooks have proper cleanup on unmount
  - [ ] No memory leaks after 100 mount/unmount cycles
  - [ ] ESLint warnings resolved
  - [ ] All tests pass
  
  **QA Scenarios**:
  ```
  Scenario: Verify hook cleanup
    Tool: Bash + Chrome DevTools
    Steps:
      1. Run dev server: bun run web dev
      2. Open Chrome DevTools > Memory > Take heap snapshot
      3. Navigate to LogViewer page, wait 10 seconds
      4. Navigate away, wait 10 seconds
      5. Take another heap snapshot
      6. Compare: no Supabase channel objects leaked
    Expected Result: No memory growth between snapshots
    Evidence: .sisyphus/evidence/task-14-memory-heaps.json
  ```
  
  **Commit**: YES
  - Message: `fix(web): cleanup and fix useLogSubscription/useJobSubscription`
  - Files: `apps/web/lib/realtime/useLogSubscription.ts`, `apps/web/lib/realtime/useJobSubscription.ts`


- [ ] 15. Write unit tests for refactored hooks

  **What to do**:
  - Write unit tests for refactored hooks:
    - `useJobBroadcasts` (after Task 12)
    - `useRunnerPresence` (after Task 13)
    - `useLogSubscription` (after Task 14)
    - `useJobSubscription` (after Task 14)
  - Test coverage for all refactored functionality
  - Mock Supabase client
  
  **Test scenarios**:
  1. "should subscribe to channel on mount"
  2. "should unsubscribe on unmount"
  3. "should handle connection state changes"
  4. "should retry on error with backoff"
  5. "should not create duplicate channels"
  6. "should update state on broadcast message"
  
  **Must NOT do**:
  - Do NOT test Supabase internals
  - Do NOT skip error scenarios
  
  **Recommended Agent Profile**:
  - **Category**: `quick` (writing tests)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocked By**: Tasks 12, 13, 14
  
  **References**:
  - `apps/web/__tests__/hooks/useRealtimeJobs.test.ts` - Example patterns
  - `apps/web/__tests__/lib/realtime/useRealtimeChannel.test.ts` - Unified hook tests (Task 7)
  
  **Acceptance Criteria**:
  - [ ] Test files created for all 4 hooks
  - [ ] Coverage >= 80% for each hook
  - [ ] All tests pass: `bun run web test __tests__/lib/realtime/`
  - [ ] Tests cover error scenarios and cleanup
  
  **QA Scenarios**:
  ```
  Scenario: Verify hook test coverage
    Tool: Bash
    Steps:
      1. Run: bun run web test __tests__/lib/realtime/ --coverage
      2. Verify: Coverage >= 80% for each file
      3. Verify: All tests pass
    Expected Result: Full test coverage
    Evidence: .sisyphus/evidence/task-15-hook-coverage.log
  ```
  
  **Commit**: YES (group with Tasks 12-14)
  - Message: `test(web): add unit tests for refactored realtime hooks`
  - Files: `apps/web/__tests__/lib/realtime/*.test.ts`


- [ ] 16. Write end-to-end integration tests

  **What to do**:
  - Write end-to-end tests for full flow:
    - Scraper emits log → Supabase Realtime → Web App receives update
  - Use Playwright for browser automation
  - Use test fixtures for mock scraper data
  - Test scenarios:
    1. "should display runner logs in real-time"
    2. "should reconnect and resume after connection drop"
    3. "should show connection status indicator"
    4. "should handle multiple concurrent runners"
  
  **Test setup**:
  ```typescript
  // Mock scraper emitting logs
  test('real-time log streaming', async ({ page }) => {
    await page.goto('/admin/scrapers');
    // Simulate scraper emitting log via API
    await mockScraperEmitLog({ jobId: 'test-123', message: 'Test log' });
    // Verify log appears in UI without refresh
    await expect(page.locator('[data-testid="log-entry"]')).toContainText('Test log');
  });
  ```
  
  **Must NOT do**:
  - Do NOT test against production Supabase (use local/dev)
  - Do NOT skip connection drop scenarios
  
  **Recommended Agent Profile**:
  - **Category**: `deep` (E2E testing, Playwright)
  - **Skills**: [`playwright`]
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5)
  - **Blocked By**: Tasks 8, 12, 13, 14
  - **Blocks**: Task 17
  
  **References**:
  - `apps/web/__tests__/e2e/` - E2E test directory
  - Playwright docs for network throttling (simulate disconnect)
  
  **Acceptance Criteria**:
  - [ ] E2E test file: `apps/web/__tests__/e2e/realtime.spec.ts`
  - [ ] Tests pass: `bun run web test:a11y:e2e --grep="realtime"` (Playwright E2E tests)
  - [ ] Tests verify real-time updates without page refresh
  - [ ] Tests verify reconnection after network drop
  - [ ] Tests take < 30 seconds each
  
  **QA Scenarios**:
  ```
  Scenario: Verify E2E real-time updates
    Tool: Playwright
    Preconditions: Dev server running, mock scraper ready
    Steps:
      1. Run: bun run web test:a11y:e2e --grep="realtime" --headed
      2. Watch: Browser opens, navigates to admin
      3. Verify: Log appears within 2 seconds of scraper emit
      4. Verify: No page refresh required
    Expected Result: Real-time updates work end-to-end
    Evidence: .sisyphus/evidence/task-16-e2e-video.webm (Playwright video)
  ```
  
  **Commit**: YES
  - Message: `test(web): add E2E tests for realtime runner logging`
  - Files: `apps/web/__tests__/e2e/realtime.spec.ts`



- [ ] 17. Memory leak detection tests (heap snapshots)

  **What to do**:
  - Create memory leak detection tests using Chrome DevTools Protocol
  - Test scenarios:
    1. "should not leak memory after 100 mount/unmount cycles"
    2. "should not leak channels after 100 subscribe/unsubscribe cycles"
    3. "should not grow unbounded with continuous log streaming"
  - Use Playwright's CDP access to take heap snapshots
  - Compare heap before/after scenarios
  
  **Test implementation**:
  ```typescript
  test('no memory leak after 100 cycles', async ({ page }) => {
    const initialMetrics = await page.evaluate(() => performance.memory);
    for (let i = 0; i < 100; i++) {
      await page.goto('/admin/scrapers');
      await page.waitForTimeout(100);
      await page.goto('/admin');
    }
    await page.evaluate(() => gc());
    const finalMetrics = await page.evaluate(() => performance.memory);
    expect(finalMetrics.usedJSHeapSize).toBeLessThan(initialMetrics.usedJSHeapSize * 1.1);
  });
  ```
  
  **Recommended Agent Profile**:
  - **Category**: `deep` (memory profiling, DevTools)
  - **Skills**: [`playwright`]
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5)
  - **Blocked By**: Task 16
  
  **Acceptance Criteria**:
  - [ ] Test file: `apps/web/__tests__/e2e/memory-leak.spec.ts`
  - [ ] Tests pass: `bun run web test:a11y:e2e --grep="memory-leak"` (Playwright E2E)
  - [ ] Memory growth < 10% after 100 cycles
  - [ ] No Supabase channel objects leaked
  
  **QA Scenarios**:
  ```
  Scenario: Verify no memory leaks
    Tool: Playwright + CDP
    Steps:
      1. Run: bun run web test:a11y:e2e --grep="memory-leak"
      2. Verify: All tests pass
    Expected Result: No memory leaks detected
    Evidence: .sisyphus/evidence/task-17-memory-report.json
  ```
  
  **Commit**: YES (group with Task 16)
  - Message: `test(web): add memory leak detection tests`


- [ ] 18. Remove legacy WebSocket hook entirely

  **What to do**:
  - Delete `apps/web/hooks/useRealtimeJobs.ts` (legacy WebSocket implementation)
  - Delete `apps/web/__tests__/hooks/useRealtimeJobs.test.ts` (legacy tests)
  - Delete backward compatibility shim from Task 2
  - Verify no imports remain
  
  **Recommended Agent Profile**:
  - **Category**: `quick` (cleanup)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5)
  - **Blocked By**: Task 2 (shim created), Task 16 (E2E tests pass)
  
  **Acceptance Criteria**:
  - [ ] Legacy hook file deleted
  - [ ] Legacy test file deleted
  - [ ] Shim file deleted
  - [ ] No imports of legacy hook anywhere
  - [ ] Build succeeds
  
  **QA Scenarios**:
  ```
  Scenario: Verify legacy removal
    Tool: Bash
    Steps:
      1. Run: grep -r "useRealtimeJobs" apps/web --include="*.ts"
      2. Verify: No results
      3. Run: bun run web build
    Expected Result: Legacy hook completely removed
    Evidence: .sisyphus/evidence/task-18-cleanup.log
  ```
  
  **Commit**: YES
  - Message: `chore(web): remove legacy useRealtimeJobs hook`


- [ ] 19. Final cleanup and documentation

  **What to do**:
  - Update `apps/scraper/docs/ARCHITECTURE.md` to remove TestLab references
  - Create `apps/web/lib/realtime/README.md` with usage docs
  - Remove TODO comments and dead code
  - Run full test suite, linter, type checker
  
  **Recommended Agent Profile**:
  - **Category**: `writing` (documentation)
  - **Skills**: []
  
  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5)
  - **Blocked By**: All previous tasks
  
  **Acceptance Criteria**:
  - [ ] Documentation updated
  - [ ] No TODO comments
  - [ ] Full test suite passes
  - [ ] Linter passes
  - [ ] TypeScript passes
  
  **QA Scenarios**:
  ```
  Scenario: Verify final state
    Tool: Bash
    Steps:
      1. Run: bun run web test
      2. Run: bun run web lint
      3. Run: cd apps/web && npx tsc --noEmit
      4. Run: bun run web build
    Expected Result: All checks pass
    Evidence: .sisyphus/evidence/task-19-final-check.log
  ```
  
  **Commit**: YES
  - Message: `docs(web,scraper): update realtime documentation`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify all "Must Have" items exist. Check "Must NOT Have" items are absent.
  Output: VERDICT: APPROVE/REJECT

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit`, linter, tests. Review for AI slop patterns.
  Output: Build PASS/FAIL | Lint PASS/FAIL | Tests N/N | VERDICT

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright`)
  Execute ALL QA scenarios from EVERY task. Test edge cases.
  Output: Scenarios N/N pass | Integration N/N | VERDICT

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify 1:1 between "What to do" and actual implementation.
  Output: Tasks N/N compliant | VERDICT

-> Present results -> Get explicit user okay

---

## Commit Strategy

**Atomic commits by wave:**
- Wave 1: Group tasks 1-3 → `chore(realtime): cleanup and compatibility`
- Wave 2: Group tasks 4-7 → `feat(realtime): unified channel hook`
- Wave 3: Group tasks 8-11 → `feat(scraper): reconnection and error handling`
- Wave 4: Group tasks 12-15 → `refactor(web): update hooks to use unified channel`
- Wave 5: Group tasks 16-19 → `test(realtime): E2E tests and cleanup`

---

## Success Criteria

### Verification Commands
```bash
# Scraper tests
cd apps/scraper && python -m pytest tests/ -v

# Web app tests
bun run web test
bun run web test:a11y:e2e

# Build
bun run web build

# Lint
bun run web lint

# Type check
cd apps/web && npx tsc --noEmit
```

### Final Checklist
- [ ] Realtime updates appear without page refresh (verified with E2E test)
- [ ] Connection drops auto-recover within 35 seconds (5 retry attempts)
- [ ] No memory leaks after 100 cycles (heap snapshot test)
- [ ] All tests pass (unit + integration + E2E)
- [ ] Legacy hook removed
- [ ] TestLab removed
- [ ] Documentation updated
- [ ] Build succeeds with no errors
