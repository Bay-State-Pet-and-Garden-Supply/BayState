/**
 * @jest-environment node
 */
import { loadOfficialBrandCandidates } from '@/lib/official-brand-review';

// buildNormalizedDomainList is called at runtime by the function under test.
jest.mock('@/lib/official-brand-workflow', () => ({
  buildNormalizedDomainList: jest.fn().mockReturnValue([]),
}));

const FAKE_NOW = '2026-05-06T12:00:00.000Z';

function makeCohortData(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cohort-dr-marty',
    name: 'Dr Marty Test',
    brand_name: 'Dr Marty',
    brand_id: 'brand-drmarty',
    brands: [
      {
        id: 'brand-drmarty',
        name: 'Dr Marty',
        official_domains: [],
        preferred_domains: [],
      },
    ],
    ...overrides,
  };
}

function makeCandidateRow(sku: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `c-${sku}`,
    sku,
    cohort_id: 'cohort-dr-marty',
    url: `https://example.com/${sku}`,
    normalized_url: `https://example.com/${sku}`,
    normalized_domain: 'example.com',
    selection_status: 'candidate',
    selection_tier: null,
    composite_score: null,
    confidence: null,
    rank: null,
    title: null,
    snippet: null,
    candidate_source: 'serper',
    appeared_in_phases: null,
    predicted_name: null,
    discovery_job_id: null,
    extraction_job_id: null,
    error_message: null,
    reviewed_at: null,
    reviewed_by: null,
    updated_at: FAKE_NOW,
    ...overrides,
  };
}

/**
 * Build a mock Supabase client with per-table chain objects.
 *
 * - cohort_batches: select → eq → maybeSingle
 * - products_ingestion: select → eq → in → order
 * - official_brand_url_candidates: select → eq → (optional eq/in)
 */
function createMockSupabase(options: {
  cohortData?: Record<string, unknown>;
  activeProducts?: Array<Record<string, unknown>>;
  allCandidates?: Array<Record<string, unknown>>;
}) {
  const {
    cohortData = makeCohortData(),
    activeProducts = [],
    allCandidates = [],
  } = options;

  const cohortResult = Promise.resolve({ data: cohortData, error: null });
  const productsResult = Promise.resolve({ data: activeProducts, error: null });
  const candidatesResult = Promise.resolve({ data: allCandidates, error: null });

  const cohortChain: any = {
    select: jest.fn(() => cohortChain),
    eq: jest.fn(() => cohortChain),
    maybeSingle: jest.fn(() => cohortResult),
  };

  const productsChain: any = {
    select: jest.fn(() => productsChain),
    eq: jest.fn(() => productsChain),
    in: jest.fn(() => productsChain),
    order: jest.fn(() => productsResult),
  };

  const candidatesChain: any = {
    select: jest.fn(() => candidatesChain),
    eq: jest.fn(() => candidatesChain),
    in: jest.fn(() => candidatesChain),
    then: (onfulfilled: (v: unknown) => unknown) =>
      candidatesResult.then(onfulfilled),
  };

  const supabase = {
    from: jest.fn((table: string) => {
      if (table === 'cohort_batches') return cohortChain;
      if (table === 'products_ingestion') return productsChain;
      if (table === 'official_brand_url_candidates') return candidatesChain;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, productsChain, candidatesChain, cohortChain };
}

describe('loadOfficialBrandCandidates', () => {
  it('returns only active SKUs, ignoring stale candidates for inactive SKUs', async () => {
    const { supabase, candidatesChain } = createMockSupabase({
      activeProducts: [
        { sku: 'DRM-001', cohort_id: 'cohort-dr-marty', input: { name: 'Product A' } },
        { sku: 'DRM-002', cohort_id: 'cohort-dr-marty', input: { name: 'Product B' } },
      ],
      // Candidate rows exist for all 3, but SKU STALE-001 is not in the active
      // products_ingestion result (it was returned to imported / moved past
      // extracting).
      allCandidates: [
        makeCandidateRow('DRM-001'),
        makeCandidateRow('DRM-002'),
        makeCandidateRow('STALE-001'),
      ],
    });

    const result = await loadOfficialBrandCandidates(
      supabase as unknown as Parameters<typeof loadOfficialBrandCandidates>[0],
      { cohortId: 'cohort-dr-marty' },
    );

    // Only 2 active SKUs should appear; the stale SKU must not be resurrected
    // just because it still has candidate rows in the table.
    expect(result.skus).toHaveLength(2);
    const skus = result.skus.map((s) => s.sku).sort();
    expect(skus).toEqual(['DRM-001', 'DRM-002']);
    expect(result.skus.find((s) => s.sku === 'STALE-001')).toBeUndefined();
    expect(result.summary.total_skus).toBe(2);
    expect(candidatesChain.in).toHaveBeenCalledWith('sku', ['DRM-001', 'DRM-002']);
  });

  it('attaches candidates to their respective active SKUs', async () => {
    const { supabase } = createMockSupabase({
      activeProducts: [
        { sku: 'DRM-001', cohort_id: 'cohort-dr-marty', input: { name: 'Product A' } },
        { sku: 'DRM-002', cohort_id: 'cohort-dr-marty', input: { name: 'Product B' } },
      ],
      allCandidates: [
        makeCandidateRow('DRM-001', { id: 'c1' }),
        makeCandidateRow('DRM-002', { id: 'c2' }),
        makeCandidateRow('STALE-001', { id: 'c3' }),
      ],
    });

    const result = await loadOfficialBrandCandidates(
      supabase as unknown as Parameters<typeof loadOfficialBrandCandidates>[0],
      { cohortId: 'cohort-dr-marty' },
    );

    const drm1 = result.skus.find((s) => s.sku === 'DRM-001');
    expect(drm1).toBeDefined();
    expect(drm1!.candidate_count).toBe(1);
    expect(drm1!.candidates[0].id).toBe('c1');

    const drm2 = result.skus.find((s) => s.sku === 'DRM-002');
    expect(drm2).toBeDefined();
    expect(drm2!.candidate_count).toBe(1);
    expect(drm2!.candidates[0].id).toBe('c2');

    // STALE-001 should not appear at all
    expect(result.skus.find((s) => s.sku === 'STALE-001')).toBeUndefined();
  });

  it('preserves existing status and discoveryJobId filters', async () => {
    const { supabase, candidatesChain } = createMockSupabase({
      activeProducts: [
        { sku: 'DRM-001', cohort_id: 'cohort-dr-marty', input: { name: 'Product A' } },
      ],
      allCandidates: [],
    });

    await loadOfficialBrandCandidates(
      supabase as unknown as Parameters<typeof loadOfficialBrandCandidates>[0],
      {
        cohortId: 'cohort-dr-marty',
        status: 'selected',
        discoveryJobId: 'job-disc-001',
      },
    );

    const eqCalls = candidatesChain.eq.mock.calls as Array<[string, unknown]>;
    const eqFields = new Set(eqCalls.map(([field]) => field));

    expect(candidatesChain.in).toHaveBeenCalledWith('sku', ['DRM-001']);
    expect(eqFields.has('selection_status')).toBe(true);
    expect(eqFields.has('discovery_job_id')).toBe(true);
  });
});
