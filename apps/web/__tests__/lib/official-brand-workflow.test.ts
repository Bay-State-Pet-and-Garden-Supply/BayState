import {
    normalizeOfficialBrandUrl,
    normalizeOfficialBrandDomain,
    normalizeOfficialBrandSearchRoot,
    officialBrandUrlMatchesDomains,
    getOfficialBrandPhaseFromJob,
    isOfficialBrandJobType,
    buildManualOfficialBrandCandidateRows,
    buildDiscoveryOfficialBrandCandidateRows,
    buildExtractedOfficialBrandCandidateRows,
    buildNormalizedDomainList,
    OFFICIAL_BRAND_URL_DISCOVERY_TYPE,
    OFFICIAL_BRAND_EXTRACTION_TYPE,
    DIRECT_URL_EXTRACTION_TYPE,
    OFFICIAL_BRAND_SOURCE_KEY,
    PRODUCT_URL_EXTRACTION_SOURCE_KEY,
} from '@/lib/official-brand-workflow';

describe('normalizeOfficialBrandUrl', () => {
    it('returns null for empty input', () => {
        expect(normalizeOfficialBrandUrl('')).toBeNull();
        expect(normalizeOfficialBrandUrl('  ')).toBeNull();
    });

    it('normalizes a valid URL', () => {
        const result = normalizeOfficialBrandUrl('https://example.com/product/123');
        expect(result).not.toBeNull();
        expect(result!.normalizedDomain).toBe('example.com');
        expect(result!.normalizedUrl).toBe('https://example.com/product/123');
    });

    it('adds https when missing', () => {
        const result = normalizeOfficialBrandUrl('example.com/product');
        expect(result).not.toBeNull();
        expect(result!.normalizedDomain).toBe('example.com');
        expect(result!.url).toMatch(/^https:\/\//);
    });

    it('strips www from domain', () => {
        const result = normalizeOfficialBrandUrl('https://www.example.com/product');
        expect(result!.normalizedDomain).toBe('example.com');
    });

    it('strips trailing hash', () => {
        const result = normalizeOfficialBrandUrl('https://example.com/page#section');
        expect(result!.normalizedUrl).not.toContain('#section');
    });

    it('rejects invalid protocols', () => {
        expect(normalizeOfficialBrandUrl('ftp://example.com')).toBeNull();
    });
});

describe('normalizeOfficialBrandDomain', () => {
    it('normalizes a clean domain', () => {
        expect(normalizeOfficialBrandDomain('Example.COM')).toBe('example.com');
    });

    it('normalizes a URL to its hostname', () => {
        expect(normalizeOfficialBrandDomain('https://www.Example.com/path')).toBe('example.com');
    });

    it('returns undefined for empty input', () => {
        expect(normalizeOfficialBrandDomain('')).toBeUndefined();
    });
});

describe('normalizeOfficialBrandSearchRoot', () => {
    it('normalizes a clean domain', () => {
        expect(normalizeOfficialBrandSearchRoot('Example.COM')).toBe('example.com');
    });

    it('preserves path in URL', () => {
        expect(normalizeOfficialBrandSearchRoot('https://www.Example.com/products')).toBe('example.com/products');
    });

    it('strips trailing slash', () => {
        expect(normalizeOfficialBrandSearchRoot('https://example.com/products/')).toBe('example.com/products');
    });

    it('handles bare domain with path', () => {
        expect(normalizeOfficialBrandSearchRoot('example.com/path')).toBe('example.com/path');
    });

    it('returns undefined for empty input', () => {
        expect(normalizeOfficialBrandSearchRoot('')).toBeUndefined();
    });
});

describe('buildNormalizedDomainList', () => {
    it('merges domain lists into a normalized deduplicated list', () => {
        const result = buildNormalizedDomainList(
            ['gofromm.com', 'frommfamily.com'],
            ['https://www.gofromm.com'],
        );
        // 'gofromm.com' appears twice (from both sources) but deduped to once
        expect(result).toEqual(['gofromm.com', 'frommfamily.com']);
    });

    it('normalizes a full URL entry while preserving path', () => {
        // Admins may paste a full URL into official_domains; normalize it but keep the path for better site: targeting.
        const result = buildNormalizedDomainList(
            [],
            ['https://www.gofromm.com/path/to/site'],
        );
        expect(result).toEqual(['gofromm.com/path/to/site']);
    });

    it('normalizes bare domain string from a source list', () => {
        const result = buildNormalizedDomainList(
            [],
            ['gofromm.com'],
        );
        expect(result).toEqual(['gofromm.com']);
    });

    it('returns empty array for empty sources', () => {
        expect(buildNormalizedDomainList()).toEqual([]);
        expect(buildNormalizedDomainList([])).toEqual([]);
    });

    it('skips null/undefined entries', () => {
        const result = buildNormalizedDomainList(
            ['gofromm.com', null, undefined],
            [undefined, 'frommfamily.com', null],
        );
        expect(result).toEqual(['gofromm.com', 'frommfamily.com']);
    });

    it('handles null/undefined sources', () => {
        const result = buildNormalizedDomainList(null, ['gofromm.com'], undefined);
        expect(result).toEqual(['gofromm.com']);
    });
});

describe('officialBrandUrlMatchesDomains', () => {
    it('returns true when domain matches', () => {
        expect(officialBrandUrlMatchesDomains('https://scottsmiraclegro.com/product', ['scottsmiraclegro.com'])).toBe(true);
    });

    it('returns false when domain does not match', () => {
        expect(officialBrandUrlMatchesDomains('https://amazon.com/product', ['scottsmiraclegro.com'])).toBe(false);
    });

    it('returns false for empty domains', () => {
        expect(officialBrandUrlMatchesDomains('https://example.com', [])).toBe(false);
    });

    it('matches subdomains', () => {
        expect(officialBrandUrlMatchesDomains('https://shop.scottsmiraclegro.com/product', ['scottsmiraclegro.com'])).toBe(true);
    });

    it('matches specific paths', () => {
        expect(officialBrandUrlMatchesDomains('https://example.com/products/sku123', ['example.com/products'])).toBe(true);
    });

    it('rejects paths outside root', () => {
        expect(officialBrandUrlMatchesDomains('https://example.com/blog/article', ['example.com/products'])).toBe(false);
    });

    it('matches exact root path', () => {
        expect(officialBrandUrlMatchesDomains('https://example.com/products', ['example.com/products'])).toBe(true);
    });
});

describe('getOfficialBrandPhaseFromJob', () => {
    it('detects url_discovery from type', () => {
        expect(getOfficialBrandPhaseFromJob({ type: OFFICIAL_BRAND_URL_DISCOVERY_TYPE })).toBe('url_discovery');
    });

    it('detects extraction from type', () => {
        expect(getOfficialBrandPhaseFromJob({ type: DIRECT_URL_EXTRACTION_TYPE })).toBe('extraction');
    });

    it('detects url_discovery from config.phase', () => {
        expect(getOfficialBrandPhaseFromJob({ type: 'ai_search', config: { phase: 'url_discovery' } })).toBe('url_discovery');
    });

    it('detects extraction from metadata', () => {
        expect(getOfficialBrandPhaseFromJob({ type: 'ai_search', metadata: { official_brand_phase: 'extraction' } })).toBe('extraction');
    });

    it('returns extraction for legacy official_brand jobs', () => {
        expect(getOfficialBrandPhaseFromJob({ metadata: { requested_job_type: 'official_brand' } })).toBe('extraction');
    });

    it('returns null for standard jobs', () => {
        expect(getOfficialBrandPhaseFromJob({ type: 'standard' })).toBeNull();
    });
});

describe('isOfficialBrandJobType', () => {
    it('returns true for discovery', () => {
        expect(isOfficialBrandJobType(OFFICIAL_BRAND_URL_DISCOVERY_TYPE)).toBe(true);
    });

    it('returns true for extraction', () => {
        expect(isOfficialBrandJobType(DIRECT_URL_EXTRACTION_TYPE)).toBe(true);
    });

    it('returns false for standard', () => {
        expect(isOfficialBrandJobType('standard')).toBe(false);
    });
});

describe('buildManualOfficialBrandCandidateRows', () => {
    it('builds candidate rows from urls_by_sku', () => {
        const rows = buildManualOfficialBrandCandidateRows({
            urlsBySku: {
                'SKU-1': 'https://example.com/product/a',
                'SKU-2': 'https://example.com/product/b',
            },
            cohort: { id: 'cohort-1', brandId: 'brand-1', brandName: 'Acme' },
            extractionJobId: 'job-extract-1',
            nowIso: '2026-05-01T00:00:00Z',
        });

        expect(rows).toHaveLength(2);
        expect(rows[0].sku).toBe('SKU-1');
        expect(rows[0].candidate_source).toBe('manual');
        expect(rows[0].selection_status).toBe('selected');
        expect(rows[0].extraction_job_id).toBe('job-extract-1');
        expect(rows[0].cohort_id).toBe('cohort-1');
        expect(rows[0].normalized_domain).toBe('example.com');
    });

    it('filters out rows with invalid URLs', () => {
        const rows = buildManualOfficialBrandCandidateRows({
            urlsBySku: {
                'SKU-1': 'https://example.com/product',
                'SKU-2': '',
            },
            cohort: undefined,
            extractionJobId: 'job-extract-1',
            nowIso: '2026-05-01T00:00:00Z',
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].sku).toBe('SKU-1');
    });
});

describe('buildDiscoveryOfficialBrandCandidateRows', () => {
    it('builds candidate rows from discovery results', () => {
        const rows = buildDiscoveryOfficialBrandCandidateRows({
            jobId: 'job-disc-1',
            resultsBySku: {
                'SKU-1': {
                    [OFFICIAL_BRAND_SOURCE_KEY]: {
                        status: 'found',
                        selected_url: 'https://example.com/product/a',
                        confidence: 0.95,
                        predicted_name: 'Consolidated Product Name',
                        candidates: [
                            {
                                url: 'https://example.com/product/a',
                                title: 'Product A',
                                rank: 1,
                                confidence: 0.95,
                                selection_tier: 'official_domain',
                                appeared_in_phases: [1, 2],
                                composite_score: 95.5,
                            },
                            {
                                url: 'https://amazon.com/product/a',
                                title: 'Product A - Amazon',
                                rank: 2,
                                confidence: 0.2,
                                selection_tier: 'organic',
                                appeared_in_phases: [1],
                                composite_score: 12.3,
                            },
                        ],
                    },
                },
            },
            cohort: { id: 'cohort-1', brandId: 'brand-1', brandName: 'Acme' },
            nowIso: '2026-05-01T00:00:00Z',
        });

        expect(rows).toHaveLength(2);
        const selected = rows.find((r) => r.selection_status === 'selected');
        expect(selected).toBeDefined();
        expect(selected!.url).toContain('example.com');

        const rejected = rows.find((r) => r.selection_status === 'candidate');
        expect(rejected).toBeDefined();
        expect(rejected!.url).toContain('amazon.com');

        // Assert new columns on selected row
        expect(selected!.predicted_name).toBe('Consolidated Product Name');
        expect(selected!.selection_tier).toBe('official_domain');
        expect(selected!.appeared_in_phases).toEqual([1, 2]);
        expect(selected!.composite_score).toBe(95.5);

        // Assert new columns on rejected row
        expect(rejected!.predicted_name).toBe('Consolidated Product Name');
        expect(rejected!.selection_tier).toBe('organic');
        expect(rejected!.appeared_in_phases).toEqual([1]);
        expect(rejected!.composite_score).toBe(12.3);
    });

    it('handles null new columns gracefully', () => {
        const rows = buildDiscoveryOfficialBrandCandidateRows({
            jobId: 'job-disc-1',
            resultsBySku: {
                'SKU-1': {
                    [OFFICIAL_BRAND_SOURCE_KEY]: {
                        status: 'found',
                        selected_url: 'https://example.com/product/a',
                        confidence: 0.95,
                        candidates: [
                            { url: 'https://example.com/product/a', title: 'Product A', rank: 1, confidence: 0.95 },
                        ],
                    },
                },
            },
            cohort: { id: 'cohort-1', brandId: 'brand-1', brandName: 'Acme' },
            nowIso: '2026-05-01T00:00:00Z',
        });

        expect(rows).toHaveLength(1);
        const row = rows[0];
        // When missing from source, should default to null
        expect(row.predicted_name).toBeNull();
        expect(row.selection_tier).toBeNull();
        expect(row.appeared_in_phases).toBeNull();
        expect(row.composite_score).toBeNull();
    });

    it('returns empty for SKUs with no official_brand data', () => {
        const rows = buildDiscoveryOfficialBrandCandidateRows({
            jobId: 'job-disc-1',
            resultsBySku: {
                'SKU-1': { some_other_source: { title: 'Other' } },
            },
            nowIso: '2026-05-01T00:00:00Z',
        });

        expect(rows).toHaveLength(0);
    });

    it('includes predicted_name on selected row when URL not in candidates', () => {
        const rows = buildDiscoveryOfficialBrandCandidateRows({
            jobId: 'job-disc-1',
            resultsBySku: {
                'SKU-1': {
                    [OFFICIAL_BRAND_SOURCE_KEY]: {
                        status: 'found',
                        selected_url: 'https://example.com/selected',
                        confidence: 0.95,
                        predicted_name: 'Predicted By LLM',
                        candidates: [
                            { url: 'https://example.com/candidate', title: 'Candidate', rank: 1, confidence: 0.5 },
                        ],
                    },
                },
            },
            nowIso: '2026-05-01T00:00:00Z',
        });

        expect(rows).toHaveLength(2);
        const selected = rows.find((r) => r.selection_status === 'selected');
        expect(selected).toBeDefined();
        expect(selected!.predicted_name).toBe('Predicted By LLM');
    });
});

describe('buildExtractedOfficialBrandCandidateRows', () => {
    it('builds extracted rows from extraction results', () => {
        const rows = buildExtractedOfficialBrandCandidateRows({
            jobId: 'job-extract-1',
            resultsBySku: {
                'SKU-1': {
                    [PRODUCT_URL_EXTRACTION_SOURCE_KEY]: {
                        title: 'Product A',
                        brand: 'Acme',
                        url: 'https://example.com/product/a',
                        source_website: 'https://example.com/product/a',
                        confidence: 0.92,
                    },
                },
            },
            config: {
                items: [{ sku: 'SKU-1', url_source: 'manual', source_url: 'https://example.com/product/a' }],
            },
            nowIso: '2026-05-01T00:00:00Z',
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].sku).toBe('SKU-1');
        expect(rows[0].selection_status).toBe('extracted');
        expect(rows[0].candidate_source).toBe('manual');
    });

    it('falls back to serper when url_source is absent', () => {
        const rows = buildExtractedOfficialBrandCandidateRows({
            jobId: 'job-extract-1',
            resultsBySku: {
                'SKU-1': {
                    [OFFICIAL_BRAND_SOURCE_KEY]: {
                        title: 'Product A',
                        url: 'https://serper-result.com/p',
                        source_website: 'https://serper-result.com/p',
                    },
                },
            },
            config: { items: [{ sku: 'SKU-1' }] },
            nowIso: '2026-05-01T00:00:00Z',
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].candidate_source).toBe('serper');
    });
});
