/**
 * @jest-environment node
 */
import {
  STATUS_TRANSITIONS,
  isTerminalStage,
  validateTransition,
} from '@/lib/pipeline/core';
import type { PersistedPipelineStatus } from '@/lib/pipeline/types';

describe('pipeline/core transition matrix', () => {
  it('matches the canonical persisted transition graph', () => {
    expect(STATUS_TRANSITIONS).toEqual({
      imported: ['scraped'],
      scraped: ['finalized'],
      finalized: ['scraped'],
      failed: ['imported'],
    });
  });

  it('allows all canonical transitions', () => {
    expect(validateTransition('imported', 'scraped')).toBe(true);
    expect(validateTransition('scraped', 'finalized')).toBe(true);
    expect(validateTransition('finalized', 'scraped')).toBe(true);
    expect(validateTransition('failed', 'imported')).toBe(true);
  });

  it('rejects non-canonical transitions', () => {
    const invalidTransitions: Array<[PersistedPipelineStatus, PersistedPipelineStatus]> = [
      ['imported', 'finalized'],
      ['imported', 'failed'],
      ['scraped', 'imported'],
      ['scraped', 'failed'],
      ['finalized', 'imported'],
      ['finalized', 'failed'],
      ['failed', 'scraped'],
      ['failed', 'finalized'],
    ];

    invalidTransitions.forEach(([from, to]) => {
      expect(validateTransition(from, to)).toBe(false);
    });
  });

  it('treats same-status transitions as valid and no persisted state as terminal', () => {
    const statuses: PersistedPipelineStatus[] = ['imported', 'scraped', 'finalized', 'failed'];

    statuses.forEach((status) => {
      expect(validateTransition(status, status)).toBe(true);
      expect(isTerminalStage(status)).toBe(false);
    });
  });
});
