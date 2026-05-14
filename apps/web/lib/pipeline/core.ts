/**
 * Pipeline Core
 * Transition validation utilities
 */

import type { PersistedPipelineStatus } from './types';

/**
 * Valid status transitions for each pipeline stage
 */
export const STATUS_TRANSITIONS: Record<
  PersistedPipelineStatus,
  PersistedPipelineStatus[]
> = {
  imported: ['scraping'],
  searching: ['url_review', 'imported', 'failed'],
  url_review: ['extracting', 'scraping', 'imported', 'failed'],
  extracting: ['scraped', 'url_review', 'failed'],
  scraping: ['scraped', 'needs_fallback_review', 'failed', 'imported'],
  needs_fallback_review: ['searching', 'scraped', 'imported', 'failed'],
  scraped: ['consolidating', 'finalizing', 'needs_fallback_review', 'imported', 'failed'],
  consolidating: ['finalizing', 'scraped', 'failed'],
  finalizing: ['exporting', 'scraped', 'failed'],
  exporting: ['finalizing', 'failed'],
  failed: ['imported', 'url_review'],
} as const;

/**
 * Validates a transition from one status to another
 *
 * @param fromStatus - Current status
 * @param toStatus - Target status
 * @returns true if transition is allowed, false otherwise
 */
export function validateTransition(
  fromStatus: PersistedPipelineStatus,
  toStatus: PersistedPipelineStatus
): boolean {
  // Same status transition is always allowed
  if (fromStatus === toStatus) {
    return true;
  }

  const allowedTransitions = STATUS_TRANSITIONS[fromStatus];
  return allowedTransitions.includes(toStatus);
}
