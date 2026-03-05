/**
 * BayState Realtime - Real-time hooks for scraper runner management
 *
 * This module provides Supabase Realtime hooks for:
 * - Runner presence tracking (online/offline status)
 * - Job broadcast events (logs, progress updates)
 * - Job subscription (Postgres Changes on scrape_jobs)
 *
 * @example
 * ```typescript
 * import {
 *   useRunnerPresence,
 *   useJobBroadcasts,
 *   useJobSubscription,
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
