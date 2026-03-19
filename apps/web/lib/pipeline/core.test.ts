/**
 * Pipeline Core Tests
 */

import {
  STATUS_TRANSITIONS,
  validateTransition,
  isTerminalStage,
  getStageConfig,
} from './core';

describe('STATUS_TRANSITIONS', () => {
  it('imported can transition to scraped', () => {
    expect(STATUS_TRANSITIONS.imported).toEqual(['scraped']);
  });
    expect(STATUS_TRANSITIONS.imported).toEqual(['scraped', 'deleted']);
  });

  it('scraped can transition to consolidated and imported', () => {
    expect(STATUS_TRANSITIONS.scraped).toEqual(['consolidated', 'imported']);
  });

  it('consolidated can transition to finalized and scraped', () => {
    expect(STATUS_TRANSITIONS.consolidated).toEqual(['finalized', 'scraped']);
  });

  it('finalized can transition to published and consolidated', () => {
    expect(STATUS_TRANSITIONS.finalized).toEqual(['published', 'consolidated']);
  });

  it('published has no outgoing transitions (terminal)', () => {
    expect(STATUS_TRANSITIONS.published).toEqual([]);
  });
});

describe('validateTransition', () => {
  describe('same status transitions', () => {
    it('allows imported -> imported', () => {
      expect(validateTransition('imported', 'imported')).toBe(true);
    });

    it('allows scraped -> scraped', () => {
      expect(validateTransition('scraped', 'scraped')).toBe(true);
    });

    it('allows consolidated -> consolidated', () => {
      expect(validateTransition('consolidated', 'consolidated')).toBe(true);
    });

    it('allows finalized -> finalized', () => {
      expect(validateTransition('finalized', 'finalized')).toBe(true);
    });

    it('allows published -> published', () => {
      expect(validateTransition('published', 'published')).toBe(true);
    });
  });

  describe('valid forward transitions', () => {
    it('allows imported -> scraped', () => {
      expect(validateTransition('imported', 'scraped')).toBe(true);
    });

    it('allows scraped -> consolidated', () => {
      expect(validateTransition('scraped', 'consolidated')).toBe(true);
    });

    it('allows consolidated -> finalized', () => {
      expect(validateTransition('consolidated', 'finalized')).toBe(true);
    });

    it('allows finalized -> published', () => {
      expect(validateTransition('finalized', 'published')).toBe(true);
    });
  });

  describe('valid backward transitions', () => {
    it('allows scraped -> imported', () => {
      expect(validateTransition('scraped', 'imported')).toBe(true);
    });

    it('allows consolidated -> scraped', () => {
      expect(validateTransition('consolidated', 'scraped')).toBe(true);
    });

    it('allows finalized -> consolidated', () => {
      expect(validateTransition('finalized', 'consolidated')).toBe(true);
    });
  });

describe('deletion transition', () => {
    it('is not supported in this version', () => {
      // 'deleted' is not a valid PipelineStatus
      expect(STATUS_TRANSITIONS.imported).not.toContain('deleted');
    });
  });
    it('allows imported -> deleted', () => {
      expect(validateTransition('imported', 'deleted')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('rejects imported -> consolidated (skipping scraped)', () => {
      expect(validateTransition('imported', 'consolidated')).toBe(false);
    });

    it('rejects imported -> finalized (skipping multiple stages)', () => {
      expect(validateTransition('imported', 'finalized')).toBe(false);
    });

    it('rejects imported -> published (skipping all stages)', () => {
      expect(validateTransition('imported', 'published')).toBe(false);
    });

    it('rejects scraped -> finalized (skipping consolidated)', () => {
      expect(validateTransition('scraped', 'finalized')).toBe(false);
    });

    it('rejects scraped -> published (skipping multiple stages)', () => {
      expect(validateTransition('scraped', 'published')).toBe(false);
    });

    it('rejects consolidated -> imported (skipping scraped)', () => {
      expect(validateTransition('consolidated', 'imported')).toBe(false);
    });

    it('rejects consolidated -> published (skipping finalized)', () => {
      expect(validateTransition('consolidated', 'published')).toBe(false);
    });

    it('rejects finalized -> imported (skipping multiple stages)', () => {
      expect(validateTransition('finalized', 'imported')).toBe(false);
    });

    it('rejects finalized -> scraped (skipping consolidated)', () => {
      expect(validateTransition('finalized', 'scraped')).toBe(false);
    });

    it('rejects published -> any status (terminal state)', () => {
      expect(validateTransition('published', 'imported')).toBe(false);
      expect(validateTransition('published', 'scraped')).toBe(false);
      expect(validateTransition('published', 'consolidated')).toBe(false);
      expect(validateTransition('published', 'finalized')).toBe(false);
      expect(validateTransition('published', 'published')).toBe(true); // same status is allowed
    });
  });
});

describe('isTerminalStage', () => {
  it('returns false for imported', () => {
    expect(isTerminalStage('imported')).toBe(false);
  });

  it('returns false for scraped', () => {
    expect(isTerminalStage('scraped')).toBe(false);
  });

  it('returns false for consolidated', () => {
    expect(isTerminalStage('consolidated')).toBe(false);
  });

  it('returns false for finalized', () => {
    expect(isTerminalStage('finalized')).toBe(false);
  });

  it('returns true for published (terminal state)', () => {
    expect(isTerminalStage('published')).toBe(true);
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

  it('returns correct config for consolidated', () => {
    const config = getStageConfig('consolidated');
    expect(config.label).toBe('Consolidated');
    expect(config.color).toBe('#8B5CF6');
  });

  it('returns correct config for finalized', () => {
    const config = getStageConfig('finalized');
    expect(config.label).toBe('Finalized');
    expect(config.color).toBe('#F59E0B');
  });

  it('returns correct config for published', () => {
    const config = getStageConfig('published');
    expect(config.label).toBe('Published');
    expect(config.color).toBe('#008850');
  });
});
