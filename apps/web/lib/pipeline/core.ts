/**
 * Pipeline Core
 * Transition validation utilities for the simplified 8-stage pipeline.
 */

import type { PersistedPipelineStatus } from './types';

/**
 * Valid status transitions for each pipeline stage.
 *
 * Simplified state machine:
 *   imported → url_review → extracting → processed → merging → reviewing → publishing
 *   Any → failed
 *   failed → imported | url_review | extracting
 *   url_review → imported
 *   extracting → url_review
 *   processed → merging | reviewing | imported
 *   merging → reviewing | processed
 *   reviewing → publishing | processed
 *   publishing → reviewing
 */
export const STATUS_TRANSITIONS: Record<
  PersistedPipelineStatus,
  PersistedPipelineStatus[]
> = {
  awaiting_brand: ['imported', 'failed'],
  imported: ['url_review', 'failed'],
  url_review: ['extracting', 'imported', 'failed'],
  extracting: ['processed', 'url_review', 'failed'],
  processed: ['merging', 'reviewing', 'imported', 'failed'],
  merging: ['reviewing', 'processed', 'failed'],
  reviewing: ['publishing', 'processed', 'failed'],
  publishing: ['reviewing', 'failed'],
  failed: ['imported', 'url_review', 'extracting'],
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
  if (!allowedTransitions) {
    return false;
  }
  return allowedTransitions.includes(toStatus);
}
