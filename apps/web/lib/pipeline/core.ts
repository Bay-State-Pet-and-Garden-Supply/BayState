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
  imported: ['scraped'],
  scraped: ['finalized', 'imported'],
  finalized: ['scraped'],
  failed: ['imported'],
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
