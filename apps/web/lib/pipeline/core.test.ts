/**
 * Pipeline Core Tests
 */

import {
  STATUS_TRANSITIONS,
  getStageConfig,
  getPersistedStageConfig,
  isTerminalStage,
  validateTransition,
} from './core';
import type { PersistedPipelineStatus } from './types';

const PERSISTED_STATUSES: PersistedPipelineStatus[] = [
  'imported',
  'scraped',
  'finalized',
  'failed',
];

describe('STATUS_TRANSITIONS', () => {
  it('matches the canonical persisted transition graph', () => {
    expect(STATUS_TRANSITIONS).toEqual({
      imported: ['scraped'],
      scraped: ['finalized'],
      finalized: ['scraped'],
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
});

describe('isTerminalStage', () => {
  it('returns false for every canonical persisted status', () => {
    PERSISTED_STATUSES.forEach((status) => {
      expect(isTerminalStage(status)).toBe(false);
    });
  });
});

describe('getStageConfig', () => {
  it('returns correct config for imported', () => {
    const config = getStageConfig('imported');
    expect(config.label).toBe('Imported');
    expect(config.color).toBe('#6B7280');
  });

  it('returns correct config for scraped', () => {
    const config = getStageConfig('scraped');
    expect(config.label).toBe('Scraped');
    expect(config.color).toBe('#3B82F6');
  });

  it('returns correct config for finalized', () => {
    const config = getStageConfig('finalized');
    expect(config.label).toBe('Finalized');
    expect(config.color).toBe('#F59E0B');
  });

  it('returns correct config for failed', () => {
    const config = getPersistedStageConfig('failed');
    expect(config.label).toBe('Failed');
    expect(config.color).toBe('#DC2626');
  });
});
