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
      imported: ['scraping'],
      scraping: ['scraped', 'failed', 'imported'],
      scraped: ['consolidating', 'finalizing', 'imported', 'failed'],
      consolidating: ['finalizing', 'scraped', 'failed'],
      finalizing: ['exporting', 'scraped', 'failed'],
      exporting: ['finalizing', 'failed'],
      failed: ['imported'],
    });
  });
});

describe('validateTransition', () => {
  it.each(PERSISTED_PIPELINE_STATUSES)('allows %s -> %s', (status) => {
    expect(validateTransition(status, status)).toBe(true);
  });

  it('allows canonical forward, retry, and rework transitions', () => {
    expect(validateTransition('imported', 'scraping')).toBe(true);
    expect(validateTransition('scraping', 'scraped')).toBe(true);
    expect(validateTransition('scraped', 'consolidating')).toBe(true);
    expect(validateTransition('consolidating', 'finalizing')).toBe(true);
    expect(validateTransition('finalizing', 'exporting')).toBe(true);
    expect(validateTransition('failed', 'imported')).toBe(true);
  });

  it('rejects non-canonical transitions', () => {
    // Some examples of invalid transitions
    expect(validateTransition('imported', 'finalizing')).toBe(false);
    expect(validateTransition('imported', 'exporting')).toBe(false);
    expect(validateTransition('scraped', 'exporting')).toBe(false);
    expect(validateTransition('exporting', 'imported')).toBe(false);
  });
});
