/**
 * Pipeline Core
 * Transition validation and stage configuration utilities
 */

import {
  STAGE_CONFIG,
  type PersistedPipelineStatus,
  type PipelineStage,
  type StageConfig,
} from './types';

/**
 * Valid status transitions for each pipeline stage
 */
export const STATUS_TRANSITIONS: Record<
  PersistedPipelineStatus,
  PersistedPipelineStatus[]
> = {
  imported: ['scraped'],
  scraped: ['finalized', 'imported'],
  finalized: ['scraped', 'imported'],
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

/**
 * Checks if a status is a terminal stage (no outgoing transitions)
 *
 * @param status - Pipeline status to check
 * @returns true if status is terminal, false otherwise
 */
export function isTerminalStage(status: PersistedPipelineStatus): boolean {
  return STATUS_TRANSITIONS[status].length === 0;
}

/**
 * Gets the stage configuration for a given status
 *
 * @param status - Pipeline status
 * @returns StageConfig for the status
 */
export function getStageConfig(status: PipelineStage): StageConfig {
  return STAGE_CONFIG[status];
}

export function getPersistedStageConfig(
  status: PersistedPipelineStatus
): StageConfig {
  return STAGE_CONFIG[status];
}
