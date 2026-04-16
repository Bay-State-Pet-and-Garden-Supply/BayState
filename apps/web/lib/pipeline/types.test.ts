import {
  getStageDataStatus,
  isDerivedTab,
  isPersistedStatus,
  isPipelineStage,
  normalizePipelineStage,
} from './types';

describe('isPersistedStatus', () => {
  it('accepts canonical persisted statuses', () => {
    expect(isPersistedStatus('imported')).toBe(true);
    expect(isPersistedStatus('scraping')).toBe(true);
    expect(isPersistedStatus('scraped')).toBe(true);
    expect(isPersistedStatus('consolidating')).toBe(true);
    expect(isPersistedStatus('finalizing')).toBe(true);
    expect(isPersistedStatus('exporting')).toBe(true);
    expect(isPersistedStatus('failed')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isPersistedStatus('unknown')).toBe(false);
  });
});

describe('isDerivedTab', () => {
  it('rejects all statuses (no tabs are currently derived)', () => {
    expect(isDerivedTab('scraping')).toBe(false);
    expect(isDerivedTab('consolidating')).toBe(false);
    expect(isDerivedTab('imported')).toBe(false);
  });
});

describe('isPipelineStage', () => {
  it('accepts every public pipeline stage', () => {
    expect(isPipelineStage('imported')).toBe(true);
    expect(isPipelineStage('scraping')).toBe(true);
    expect(isPipelineStage('scraped')).toBe(true);
    expect(isPipelineStage('consolidating')).toBe(true);
    expect(isPipelineStage('finalizing')).toBe(true);
    expect(isPipelineStage('exporting')).toBe(true);
    expect(isPipelineStage('failed')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isPipelineStage('unknown')).toBe(false);
  });
});

describe('getStageDataStatus', () => {
  it('maps stages with persisted backing data', () => {
    expect(getStageDataStatus('imported')).toBe('imported');
    expect(getStageDataStatus('scraping')).toBe('scraping');
    expect(getStageDataStatus('scraped')).toBe('scraped');
    expect(getStageDataStatus('consolidating')).toBe('consolidating');
    expect(getStageDataStatus('finalizing')).toBe('finalizing');
    expect(getStageDataStatus('exporting')).toBe('exporting');
    expect(getStageDataStatus('failed')).toBe('failed');
  });
});

describe('normalizePipelineStage', () => {
  it('maps legacy stage names onto canonical ones', () => {
    expect(normalizePipelineStage('finalized')).toBe('finalizing');
    expect(normalizePipelineStage('export')).toBe('exporting');
    expect(normalizePipelineStage('published')).toBe('exporting');
  });

  it('passes through canonical stages and rejects unknown values', () => {
    expect(normalizePipelineStage('finalizing')).toBe('finalizing');
    expect(normalizePipelineStage('unknown')).toBeNull();
    expect(normalizePipelineStage(undefined)).toBeNull();
  });
});
