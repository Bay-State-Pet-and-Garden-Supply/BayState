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
      imported: ['url_review', 'failed'],
      url_review: ['extracting', 'imported', 'failed'],
      extracting: ['processed', 'url_review', 'failed'],
      processed: ['merging', 'reviewing', 'imported', 'failed'],
      merging: ['reviewing', 'processed', 'failed'],
      reviewing: ['publishing', 'processed', 'failed'],
      publishing: ['reviewing', 'failed'],
      failed: ['imported', 'url_review', 'extracting'],
    });
  });
});

describe('validateTransition', () => {
  it.each(PERSISTED_PIPELINE_STATUSES)('allows %s -> %s', (status) => {
    expect(validateTransition(status, status)).toBe(true);
  });

  it('allows canonical forward, retry, and rework transitions', () => {
    expect(validateTransition('imported', 'url_review')).toBe(true);
    expect(validateTransition('url_review', 'extracting')).toBe(true);
    expect(validateTransition('extracting', 'processed')).toBe(true);
    expect(validateTransition('processed', 'merging')).toBe(true);
    expect(validateTransition('merging', 'reviewing')).toBe(true);
    expect(validateTransition('reviewing', 'publishing')).toBe(true);
    expect(validateTransition('publishing', 'reviewing')).toBe(true);
    expect(validateTransition('extracting', 'url_review')).toBe(true);
    expect(validateTransition('extracting', 'failed')).toBe(true);
    expect(validateTransition('processed', 'imported')).toBe(true);
    expect(validateTransition('processed', 'failed')).toBe(true);
    expect(validateTransition('failed', 'imported')).toBe(true);
    expect(validateTransition('failed', 'url_review')).toBe(true);
    expect(validateTransition('failed', 'extracting')).toBe(true);
  });

  it('rejects non-canonical transitions', () => {
    // Some examples of invalid transitions
    expect(validateTransition('imported', 'publishing')).toBe(false);
    expect(validateTransition('imported', 'failed')).toBe(true);
    expect(validateTransition('imported', 'processed')).toBe(false);
    expect(validateTransition('url_review', 'publishing')).toBe(false);
    expect(validateTransition('url_review', 'processed')).toBe(false);
    expect(validateTransition('extracting', 'publishing')).toBe(false);
    expect(validateTransition('extracting', 'merging')).toBe(false);
    expect(validateTransition('processed', 'publishing')).toBe(false);
    expect(validateTransition('publishing', 'imported')).toBe(false);
  });
});
