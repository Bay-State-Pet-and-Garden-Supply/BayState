import {
  type SerperCandidate,
  type MergedCandidate,
  isAmbiguousIdentifier,
  buildPhase1Query,
  buildPhase2Query,
  buildExclusionQuery,
  buildSiteConstrainedQueries,
  mergeAndDedupeCandidates,
  getSelectionTier,
  rankCandidates,
  SITE_EXCLUSIONS,
} from '@/lib/official-brand-scoring';

describe('isAmbiguousIdentifier', () => {
  it('returns true for short numeric SKUs', () => {
    expect(isAmbiguousIdentifier('1234')).toBe(true);
  });

  it('returns false for long numeric SKUs', () => {
    expect(isAmbiguousIdentifier('123456')).toBe(false);
  });

  it('returns false for alphanumeric SKUs', () => {
    expect(isAmbiguousIdentifier('SKU-123')).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(isAmbiguousIdentifier('')).toBe(false);
    expect(isAmbiguousIdentifier('   ')).toBe(false);
  });
});

describe('buildPhase1Query', () => {
  it('returns SKU alone for strong identifiers', () => {
    expect(buildPhase1Query('072705115310', 'Fromm')).toBe('072705115310');
  });

  it('prepends brand for short ambiguous SKUs', () => {
    expect(buildPhase1Query('1234', 'Fromm')).toBe('Fromm 1234');
  });

  it('returns empty for empty input', () => {
    expect(buildPhase1Query('')).toBe('');
  });

  it('returns SKU alone when no brand given for ambiguous SKU', () => {
    expect(buildPhase1Query('1234')).toBe('1234');
  });
});

describe('buildPhase2Query', () => {
  it('combines predicted name and brand', () => {
    expect(buildPhase2Query('Gold Large Breed Dog Food', 'Fromm')).toBe(
      'Gold Large Breed Dog Food Fromm',
    );
  });

  it('returns name alone without brand', () => {
    expect(buildPhase2Query('Gold Large Breed Dog Food')).toBe(
      'Gold Large Breed Dog Food',
    );
  });
});

describe('buildExclusionQuery', () => {
  it('appends -site: for each exclusion domain', () => {
    const result = buildExclusionQuery('Fromm Gold');
    for (const domain of SITE_EXCLUSIONS) {
      expect(result).toContain(`-site:${domain}`);
    }
    expect(result).toContain('Fromm Gold');
  });

  it('returns empty for empty input', () => {
    expect(buildExclusionQuery('')).toBe('');
  });
});

describe('buildSiteConstrainedQueries', () => {
  it('builds site: queries for each domain', () => {
    const result = buildSiteConstrainedQueries(
      ['gofromm.com', 'example.com'],
      'Fromm Gold',
    );
    expect(result).toEqual([
      'site:gofromm.com Fromm Gold',
      'site:example.com Fromm Gold',
    ]);
  });

  it('preserves paths in site: queries', () => {
    const result = buildSiteConstrainedQueries(
      ['gofromm.com/products', 'example.com/site/path'],
      'Fromm Gold',
    );
    expect(result).toEqual([
      'site:gofromm.com/products Fromm Gold',
      'site:example.com/site/path Fromm Gold',
    ]);
  });

  it('returns empty when no domains', () => {
    expect(buildSiteConstrainedQueries([], 'query')).toEqual([]);
  });
});

describe('mergeAndDedupeCandidates', () => {
  const urlA = 'https://gofromm.com/product';
  const urlB = 'https://amazon.com/other';

  function makeCandidate(url: string, type: 'organic' | 'knowledge_graph' = 'organic'): SerperCandidate {
    return { url, title: 'Test', snippet: 'Test snippet', result_type: type };
  }

  it('tags Phase-1-only candidates', () => {
    const merged = mergeAndDedupeCandidates([makeCandidate(urlA)], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].appeared_in_phases).toEqual([1]);
  });

  it('tags Phase-2-only candidates', () => {
    const merged = mergeAndDedupeCandidates([], [makeCandidate(urlA)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].appeared_in_phases).toEqual([2]);
  });

  it('tags cross-phase candidates with both phases', () => {
    const merged = mergeAndDedupeCandidates(
      [makeCandidate(urlA)],
      [makeCandidate(urlA)],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].appeared_in_phases).toEqual([1, 2]);
  });

  it('deduplicates by URL keeping both phases', () => {
    const merged = mergeAndDedupeCandidates(
      [makeCandidate(urlA), makeCandidate(urlB)],
      [makeCandidate(urlA)],
    );
    expect(merged).toHaveLength(2);
    const a = merged.find((c) => c.url === urlA)!;
    const b = merged.find((c) => c.url === urlB)!;
    expect(a.appeared_in_phases).toEqual([1, 2]);
    expect(b.appeared_in_phases).toEqual([1]);
  });
});

describe('getSelectionTier', () => {
  it('returns official_domain for exact domain match', () => {
    expect(getSelectionTier('https://gofromm.com/product', ['gofromm.com'], [])).toBe(
      'official_domain',
    );
  });

  it('matches subdomains of official domains', () => {
    expect(getSelectionTier('https://shop.gofromm.com/product', ['gofromm.com'], [])).toBe(
      'official_domain',
    );
  });

  it('matches www prefix correctly', () => {
    expect(getSelectionTier('https://www.gofromm.com/product', ['gofromm.com'], [])).toBe(
      'official_domain',
    );
  });

  it('returns preferred_domain for preferred domain match', () => {
    expect(getSelectionTier('https://preferred.example.com/product', [], ['example.com'])).toBe(
      'preferred_domain',
    );
  });

  it('returns organic when no domain matches', () => {
    expect(getSelectionTier('https://amazon.com/product', ['gofromm.com'], [])).toBe(
      'organic',
    );
  });

  it('matches specific paths for official domains', () => {
    expect(getSelectionTier('https://example.com/products/sku123', ['example.com/products'], [])).toBe(
      'official_domain',
    );
  });

  it('rejects specific paths for official domains if outside root', () => {
    expect(getSelectionTier('https://example.com/blog/article', ['example.com/products'], [])).toBe(
      'organic',
    );
  });

  it('official_domain beats preferred_domain', () => {
    expect(getSelectionTier('https://gofromm.com/product', ['gofromm.com'], ['gofromm.com'])).toBe(
      'official_domain',
    );
  });
});

describe('rankCandidates', () => {
  function candidate(
    url: string,
    overrides: Partial<SerperCandidate> = {},
  ): SerperCandidate {
    return {
      url,
      title: 'Test',
      snippet: 'Test snippet',
      result_type: 'organic',
      ...overrides,
    };
  }

  function merged(c: SerperCandidate, phases: number[] = [1]): MergedCandidate {
    return { ...c, appeared_in_phases: phases };
  }

  const gofrommUrl = 'https://gofromm.com/product';
  const preferredUrl = 'https://preferred-partner.com/product';
  const amazonUrl = 'https://amazon.com/other';
  const knowledgeGraphUrl = 'https://knowledgegraph.com/page';

  const officialDomains = ['gofromm.com'];
  const preferredDomains = ['preferred-partner.com'];

  it('official domain outranks organic even with confidence 0', () => {
    const candidates = [
      merged(candidate(amazonUrl)),
      merged(candidate(gofrommUrl)),
    ];
    const confidence = new Map<number, number>([[0, 0], [1, 0]]);
    const ranked = rankCandidates(candidates, confidence, officialDomains, preferredDomains, 'SKU-1', null);

    expect(ranked[0].selection_tier).toBe('official_domain');
    expect(ranked[0].url).toBe(gofrommUrl);
    expect(ranked[1].selection_tier).toBe('organic');
  });

  it('official domain gets composite_score >= 80', () => {
    const candidates = [
      merged(candidate(gofrommUrl), [1]),
    ];
    const confidence = new Map<number, number>([[0, 0]]);
    const ranked = rankCandidates(candidates, confidence, officialDomains, preferredDomains, 'SKU-1', null);

    expect(ranked[0].composite_score).toBeGreaterThanOrEqual(80);
  });

  it('preferred_domain ranks below official and above organic', () => {
    const candidates = [
      merged(candidate(amazonUrl)),
      merged(candidate(gofrommUrl)),
      merged(candidate(preferredUrl)),
    ];
    const confidence = new Map<number, number>([[0, 0], [1, 0], [2, 0]]);
    const ranked = rankCandidates(candidates, confidence, officialDomains, preferredDomains, 'SKU-1', null);

    const tiers = ranked.map((c) => c.selection_tier);
    expect(tiers).toEqual(['official_domain', 'preferred_domain', 'organic']);
  });

  it('knowledge_graph ranks below preferred and above organic', () => {
    const candidates = [
      merged(candidate(amazonUrl)),
      merged(candidate(knowledgeGraphUrl, { result_type: 'knowledge_graph' })),
      merged(candidate(preferredUrl)),
    ];
    const confidence = new Map<number, number>([[0, 0], [1, 0], [2, 0]]);
    const ranked = rankCandidates(candidates, confidence, [], preferredDomains, 'SKU-1', null);

    const tiers = ranked.map((c) => c.selection_tier);
    expect(tiers).toEqual(['preferred_domain', 'knowledge_graph', 'organic']);
  });

  it('organic cross-phase/SKU/name bonuses cannot outrank official domain', () => {
    // An organic candidate with maximum possible bonuses — title
    // includes the SKU and predicted-name words so SKU_IN_CONTENT and
    // PREDICTED_NAME_OVERLAP bonuses actually fire.
    const organicUrl = 'https://chewy.com/product';
    const candidates = [
      merged(
        candidate(organicUrl, {
          title: 'Buy SKU-123 Official Product Name cheap',
          snippet: 'SKU-123 is the best official product deal',
        }),
        [1, 2],
      ),
      merged(candidate(gofrommUrl), [1]),
    ];

    // Give organic high LLM confidence, official zero
    const confidence = new Map<number, number>([
      [0, 1.0],   // organic with max LLM confidence
      [1, 0],     // official with zero confidence
    ]);

    const ranked = rankCandidates(
      candidates,
      confidence,
      officialDomains,
      preferredDomains,
      'SKU-123',       // SKU in content check
      'Official Product Name',  // predicted name overlap
    );

    // Official must rank first regardless of bonuses
    expect(ranked[0].selection_tier).toBe('official_domain');
    expect(ranked[0].url).toBe(gofrommUrl);
  });

  it('cross-phase confirmation adds bonus', () => {
    const singlePhase = merged(candidate(gofrommUrl), [1]);
    const crossPhase = merged(candidate(gofrommUrl), [1, 2]);
    const confidence = new Map<number, number>([[0, 0], [1, 0]]);

    const ranked = rankCandidates(
      [singlePhase, crossPhase],
      confidence,
      officialDomains,
      preferredDomains,
      'SKU-1',
      null,
    );

    // Cross-phase should have higher composite_score
    expect(ranked.find((c) => c.appeared_in_phases.length > 1)!.composite_score).toBeGreaterThan(
      ranked.find((c) => c.appeared_in_phases.length === 1)!.composite_score,
    );
  });

  it('full URL in official_domains gets normalized and matches', () => {
    // When a full URL like 'https://manufacturer.com/' is stored in official_domains,
    // it gets normalized to bare domain before matching.
    const manualOfficial = ['manufacturer.com'];
    const url = 'https://manufacturer.com/product';
    const candidates = [merged(candidate(url))];
    const confidence = new Map<number, number>([[0, 0]]);

    const ranked = rankCandidates(candidates, confidence, manualOfficial, [], 'SKU-1', null);
    expect(ranked[0].selection_tier).toBe('official_domain');
  });
});
