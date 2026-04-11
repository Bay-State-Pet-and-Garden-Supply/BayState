import {
  getStageDataStatus,
  isDerivedTab,
  isPersistedStatus,
  isPipelineStage,
} from './types';

describe('isPersistedStatus', () => {
  it('accepts canonical persisted statuses', () => {
    expect(isPersistedStatus('imported')).toBe(true);
    expect(isPersistedStatus('scraped')).toBe(true);
    expect(isPersistedStatus('finalized')).toBe(true);
    expect(isPersistedStatus('failed')).toBe(true);
  });

  it('rejects derived tabs and unknown values', () => {
    expect(isPersistedStatus('scraping')).toBe(false);
    expect(isPersistedStatus('published')).toBe(false);
    expect(isPersistedStatus('unknown')).toBe(false);
  });
});

describe('isDerivedTab', () => {
  it('accepts derived pipeline tabs only', () => {
    expect(isDerivedTab('scraping')).toBe(true);
    expect(isDerivedTab('consolidating')).toBe(true);
    expect(isDerivedTab('finalizing')).toBe(true);
    expect(isDerivedTab('published')).toBe(true);
  });

  it('rejects persisted statuses', () => {
    expect(isDerivedTab('imported')).toBe(false);
    expect(isDerivedTab('scraped')).toBe(false);
  });
});

describe('isPipelineStage', () => {
  it('accepts every public pipeline stage', () => {
    expect(isPipelineStage('imported')).toBe(true);
    expect(isPipelineStage('scraping')).toBe(true);
    expect(isPipelineStage('scraped')).toBe(true);
    expect(isPipelineStage('consolidating')).toBe(true);
    expect(isPipelineStage('finalizing')).toBe(true);
    expect(isPipelineStage('published')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isPipelineStage('failed')).toBe(false);
    expect(isPipelineStage('unknown')).toBe(false);
  });
});

describe('getStageDataStatus', () => {
  it('maps stages with persisted backing data', () => {
    expect(getStageDataStatus('imported')).toBe('imported');
    expect(getStageDataStatus('scraped')).toBe('scraped');
    expect(getStageDataStatus('finalizing')).toBe('finalized');
  });

  it('returns null for live or derived-only stages', () => {
    expect(getStageDataStatus('scraping')).toBeNull();
    expect(getStageDataStatus('consolidating')).toBeNull();
    expect(getStageDataStatus('published')).toBeNull();
  });
});
