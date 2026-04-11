/**
 * Pipeline Core Tests
 */

import {
  STATUS_TRANSITIONS,
  validateTransition,
} from './core';
import type { PersistedPipelineStatus } from './types';

const PERSISTED_STATUSES: PersistedPipelineStatus[] = [
  'imported',
  'scraped',
  'finalized',
  'published',
  'failed',
];

describe('STATUS_TRANSITIONS', () => {
  it('matches the canonical persisted transition graph', () => {
    expect(STATUS_TRANSITIONS).toEqual({
      imported: ['scraped'],
      scraped: ['finalized', 'imported'],
      finalized: ['published', 'scraped'],
      published: [],
      failed: ['imported'],
    });
  });
});

describe('validateTransition', () => {
  it.each(PERSISTED_STATUSES)('allows %s -> %s', (status) => {
    expect(validateTransition(status, status)).toBe(true);
  });

  it('allows canonical forward, retry, and rework transitions', () => {
    expect(validateTransition('imported', 'scraped')).toBe(true);
    expect(validateTransition('scraped', 'finalized')).toBe(true);
    expect(validateTransition('scraped', 'imported')).toBe(true);
    expect(validateTransition('finalized', 'published')).toBe(true);
    expect(validateTransition('finalized', 'scraped')).toBe(true);
    expect(validateTransition('failed', 'imported')).toBe(true);
  });

  it('rejects non-canonical transitions', () => {
    const invalidTransitions: Array<[PersistedPipelineStatus, PersistedPipelineStatus]> = [
      ['imported', 'finalized'],
      ['imported', 'failed'],
      ['imported', 'published'],
      ['scraped', 'failed'],
      ['scraped', 'published'],
      ['finalized', 'imported'],
      ['finalized', 'failed'],
      ['published', 'imported'],
      ['published', 'scraped'],
      ['published', 'finalized'],
      ['published', 'failed'],
      ['failed', 'scraped'],
      ['failed', 'finalized'],
      ['failed', 'published'],
    ];

    invalidTransitions.forEach(([from, to]) => {
      expect(validateTransition(from, to)).toBe(false);
    });
  });
});
