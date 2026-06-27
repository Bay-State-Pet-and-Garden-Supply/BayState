/**
 * Pipeline Core Tests
 */

import {
  STATUS_TRANSITIONS,
  validateTransition,
} from './core';
import { PERSISTED_PIPELINE_STATUSES } from './types';

describe('STATUS_TRANSITIONS', () => {
  it('matches the canonical persisted transition graph', () => {
    expect(STATUS_TRANSITIONS).toEqual({
      awaiting_brand: ['imported', 'failed'],
      imported: ['extracting', 'awaiting_brand', 'failed'],
      extracting: ['processed', 'needs_attention', 'imported', 'failed'],
      needs_attention: ['imported', 'extracting', 'processed', 'failed'],
      processed: ['extracting', 'grouping', 'merging', 'reviewing', 'imported', 'failed'],
      grouping: ['merging', 'processed', 'failed'],
      merging: ['reviewing', 'processed', 'failed'],
      reviewing: ['publishing', 'processed', 'grouping', 'merging', 'failed'],
      publishing: ['reviewing', 'failed'],
      failed: ['imported', 'extracting'],
    });
  });
});

describe('validateTransition', () => {
  it.each(PERSISTED_PIPELINE_STATUSES)('allows %s -> %s', (status) => {
    expect(validateTransition(status, status)).toBe(true);
  });

  it('allows canonical forward, retry, and rework transitions', () => {
    expect(validateTransition('imported', 'extracting')).toBe(true);
    expect(validateTransition('extracting', 'processed')).toBe(true);
    expect(validateTransition('processed', 'merging')).toBe(true);
    expect(validateTransition('merging', 'reviewing')).toBe(true);
    expect(validateTransition('reviewing', 'publishing')).toBe(true);
    expect(validateTransition('publishing', 'reviewing')).toBe(true);
    expect(validateTransition('extracting', 'imported')).toBe(true);
    expect(validateTransition('extracting', 'failed')).toBe(true);
    expect(validateTransition('processed', 'imported')).toBe(true);
    expect(validateTransition('processed', 'failed')).toBe(true);
    expect(validateTransition('failed', 'imported')).toBe(true);
    expect(validateTransition('failed', 'extracting')).toBe(true);
  });

  it('rejects non-canonical transitions', () => {
    // Some examples of invalid transitions
    expect(validateTransition('imported', 'publishing')).toBe(false);
    expect(validateTransition('imported', 'failed')).toBe(true);
    expect(validateTransition('imported', 'processed')).toBe(false);
    expect(validateTransition('extracting', 'publishing')).toBe(false);
    expect(validateTransition('extracting', 'merging')).toBe(false);
    expect(validateTransition('processed', 'publishing')).toBe(false);
    expect(validateTransition('publishing', 'imported')).toBe(false);
  });
});
