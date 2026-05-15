/**
 * Pipeline Core
 * Transition validation utilities for the pipeline.
 */

import type { PersistedPipelineStatus } from './types';

/**
 * Valid status transitions for each pipeline stage.
 *
 * State machine:
 *   awaiting_brand → imported, failed
 *   imported → extracting, failed
 *   extracting → processed, failed
 *   processed → merging, reviewing, imported, failed
 *   merging → reviewing, processed, failed
 *   reviewing → publishing, processed, failed
 *   publishing → reviewing, failed
 *   failed → imported, extracting
 */
export const STATUS_TRANSITIONS: Record<
  PersistedPipelineStatus,
  PersistedPipelineStatus[]
> = {
  awaiting_brand: ['imported', 'failed'],
  imported: ['extracting', 'awaiting_brand', 'failed'],
  extracting: ['processed', 'imported', 'failed'],
  processed: ['merging', 'reviewing', 'imported', 'failed'],
  merging: ['reviewing', 'processed', 'failed'],
  reviewing: ['publishing', 'processed', 'failed'],
  publishing: ['reviewing', 'failed'],
  failed: ['imported', 'extracting'],
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
