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
      imported: ['scraping', 'searching'],
      searching: ['url_review', 'imported', 'failed'],
      url_review: ['extracting', 'scraping', 'imported', 'failed'],
      extracting: ['scraped', 'url_review', 'failed'],
      scraping: ['scraped', 'failed', 'imported'],
      scraped: ['consolidating', 'finalizing', 'imported', 'failed'],
      consolidating: ['finalizing', 'scraped', 'failed'],
      finalizing: ['exporting', 'scraped', 'failed'],
      exporting: ['finalizing', 'failed'],
      failed: ['imported', 'url_review'],
    });
  });
});

describe('validateTransition', () => {
  it.each(PERSISTED_PIPELINE_STATUSES)('allows %s -> %s', (status) => {
    expect(validateTransition(status, status)).toBe(true);
  });

  it('allows canonical forward, retry, and rework transitions', () => {
    expect(validateTransition('imported', 'searching')).toBe(true);
    expect(validateTransition('searching', 'url_review')).toBe(true);
    expect(validateTransition('url_review', 'extracting')).toBe(true);
    expect(validateTransition('extracting', 'scraped')).toBe(true);
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
    expect(validateTransition('imported', 'failed')).toBe(false);
    expect(validateTransition('searching', 'scraped')).toBe(false);
    expect(validateTransition('url_review', 'finalizing')).toBe(false);
    expect(validateTransition('extracting', 'exporting')).toBe(false);
    expect(validateTransition('scraped', 'exporting')).toBe(false);
    expect(validateTransition('exporting', 'imported')).toBe(false);
  });
});
