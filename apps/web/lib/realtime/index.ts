/**
 * BayState Realtime - Real-time hooks for scraper runner management
 *
 * This module provides Supabase Realtime hooks for:
 * - DB-backed runner state from scraper_runners
 * - DB-backed job state from scrape_jobs
 * - DB-backed persisted logs from scrape_job_logs
 * - Optional transient broadcast diagnostics when explicitly needed
 *
 * @example
 * ```typescript
 * import {
 *   useRunnerPresence,
 *   useJobSubscription,
 *   useLogSubscription,
 * } from '@/lib/realtime';
 * ```
 */

// Types
export * from './types';
export * from './broadcast-types';

// Hooks
export { useRunnerPresence } from './useRunnerPresence';
export { useJobBroadcasts } from './useJobBroadcasts';
export { useJobSubscription } from './useJobSubscription';
export { useLogSubscription } from './useLogSubscription';
