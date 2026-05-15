import {
  isDerivedTab,
  isPersistedStatus,
  isPipelineStage,
  normalizePipelineStage,
} from './types';

describe('isPersistedStatus', () => {
  it('accepts canonical persisted statuses', () => {
    expect(isPersistedStatus('imported')).toBe(true);
    expect(isPersistedStatus('url_review')).toBe(false);
    expect(isPersistedStatus('extracting')).toBe(true);
    expect(isPersistedStatus('processed')).toBe(true);
    expect(isPersistedStatus('merging')).toBe(true);
    expect(isPersistedStatus('reviewing')).toBe(true);
    expect(isPersistedStatus('publishing')).toBe(true);
    expect(isPersistedStatus('failed')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isPersistedStatus('unknown')).toBe(false);
  });
});

describe('isDerivedTab', () => {
  it('rejects all statuses (no tabs are currently derived)', () => {
    expect(isDerivedTab('extracting')).toBe(false);
    expect(isDerivedTab('merging')).toBe(false);
    expect(isDerivedTab('imported')).toBe(false);
  });
});

describe('isPipelineStage', () => {
  it('accepts every public pipeline stage', () => {
    expect(isPipelineStage('imported')).toBe(true);
    expect(isPipelineStage('awaiting_brand')).toBe(true);
    expect(isPipelineStage('extracting')).toBe(true);
    expect(isPipelineStage('processed')).toBe(true);
    expect(isPipelineStage('merging')).toBe(true);
    expect(isPipelineStage('reviewing')).toBe(true);
    expect(isPipelineStage('publishing')).toBe(true);
    expect(isPipelineStage('failed')).toBe(true);
  });

  it('rejects legacy stages no longer shown as tabs', () => {
    expect(isPipelineStage('url_review')).toBe(false);
  });

  it('rejects unknown values', () => {
    expect(isPipelineStage('unknown')).toBe(false);
  });
});



describe('normalizePipelineStage', () => {
  it('maps legacy stage names onto canonical ones', () => {
    expect(normalizePipelineStage('finalized')).toBe('reviewing');
    expect(normalizePipelineStage('export')).toBe('publishing');
    expect(normalizePipelineStage('published')).toBe('publishing');
    expect(normalizePipelineStage('scraped')).toBe('processed');
    expect(normalizePipelineStage('consolidating')).toBe('merging');
    expect(normalizePipelineStage('exporting')).toBe('publishing');
  });

  it('passes through canonical stages and rejects unknown values', () => {
    expect(normalizePipelineStage('reviewing')).toBe('reviewing');
    expect(normalizePipelineStage('unknown')).toBeNull();
    expect(normalizePipelineStage(undefined)).toBeNull();
  });
});
