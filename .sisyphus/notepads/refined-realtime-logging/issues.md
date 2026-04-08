## 2026-04-08 - F2 code quality re-run

- TypeScript fails in `apps/web/lib/realtime/useJobBroadcasts.ts` at lines 381 and 461 with parse errors, caused by an extra `}, []);` after `handleRealtimeError`.
- The requested Jest command uses deprecated `--testPathPattern`; corrected `--testPathPatterns='realtime'` runs but still fails: 2/5 suites failed, 4/66 tests failed.
- Production build still fails with an import trace through `apps/web/lib/realtime/useJobBroadcasts.ts` into the scraper log viewer route.
- LSP diagnostics for `apps/web/lib/realtime` and `apps/web/__tests__/lib/realtime` reported clean despite compiler/build failures, so compiler checks remain the source of truth here.
- No `console.log/error/warn`, `as any`, `@ts-ignore`, or `@ts-expect-error` matches were found in realtime source/tests during this verification pass.

## 2026-04-08 - F1 plan compliance re-audit

- `apps/web/lib/realtime/useRunnerPresence.ts` still bypasses the unified `useRealtimeChannel` hook and manages its own channel/client state directly.
- `apps/web/lib/realtime/useRunnerPresence.ts` never assigns `channelRef.current = channel`, so duplicate `connect()` calls create duplicate channels and `disconnect()` cannot remove the active channel.
- `apps/web/lib/realtime/useJobSubscription.ts` still contains an empty `catch {}` block in `refetch()`, so silent failure handling remains present.
- `bun run web build` currently fails on `apps/web/lib/realtime/useJobBroadcasts.ts:381` because of a stray extra `}, []);`.
- Targeted web realtime Jest run failed in 2 suites / 4 tests; scraper realtime pytest failed in 1 test (`test_transport_broadcasts_normalized_log_and_progress`).

## 2026-04-08 - F4 scope fidelity re-run

- Final fidelity re-run still rejects the scope because core acceptance checks remain red: `bun run web build` fails on the `useJobBroadcasts.ts` parse error, targeted realtime Jest fails in `useJobBroadcasts` and `useRunnerPresence`, and targeted scraper realtime pytest still has 1 failing unit test.
- Task 9/10/11 verification is incomplete because `JobLogTransport.broadcast()` assumes `asyncio.run_coroutine_threadsafe()` always returns a Future; `tests/unit/test_job_logging_transport.py::test_transport_broadcasts_normalized_log_and_progress` fails when the patched helper returns `None`.
- Task 13 verification remains red because `useRunnerPresence` does not mark the created Supabase channel as current state and therefore cannot satisfy duplicate-connect or disconnect behavior under test.
- Task 19 fidelity is also affected by leftover TODO comments outside the new realtime README path (`apps/scraper/scrapers/runtime.py`, `apps/scraper/tests/unit/test_extract_transform.py`), so the plan's cleanup language was not fully satisfied at repo scope.
