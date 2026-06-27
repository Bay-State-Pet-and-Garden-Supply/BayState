/**
 * @jest-environment node
 */

import { resolveProfileSnapshots } from '@/lib/approved-sources/source-plan';
import type { SourcePlanResult } from '@/lib/approved-sources/types';

// =============================================================================
// Mock Supabase helper for resolveProfileSnapshots query chains
// =============================================================================
// resolveProfileSnapshots issues these queries:
//   1. .from("site_extraction_profiles").select(...).in("brand_id",...).in("source_slug",...).eq("status","active")
//   2. .from("site_extraction_profile_versions").select(...).in("id",...).eq("status","active")
// =============================================================================

interface MockQueryResponse {
  data?: any[] | null;
  error?: any | null;
}

function createMockDbForProfileSnapshots(responses: MockQueryResponse[]) {
  let callIdx = 0;
  const resolveNext = () => {
    const r = responses[callIdx] ?? { data: [], error: null };
    callIdx++;
    return Promise.resolve(r);
  };

  // We can't use a simple chain counter here because we need to distinguish
  // which table is being queried. Track by the number of ".in()" calls.
  let inCallCount = 0;

  const db: any = {
    from: jest.fn(() => db),
    select: jest.fn(() => db),
    in: jest.fn(() => {
      inCallCount++;
      // After the second .in(), the next method resolves (profiles query)
      // After the first .in(), it resolves (versions query, only one .in())
      // We use a heuristic: if it's the 2nd .in() call, resolve next.
      // Actually simpler: always return db, and the final .eq() resolves.
      return db;
    }),
    eq: jest.fn(() => resolveNext()),
    order: jest.fn(() => resolveNext()),
    single: jest.fn(() => resolveNext()),
    insert: jest.fn(() => db),
    delete: jest.fn(() => db),
    update: jest.fn(() => db),
    rpc: jest.fn(() => resolveNext()),
  };

  return db;
}

// =============================================================================
// Sample data
// =============================================================================

const MOCK_PROFILES = [
  {
    id: 'pf-1',
    brand_id: 'brand-1',
    source_slug: 'testbrand',
    canonical_domain: 'testbrand.com',
    status: 'active',
    active_version_id: 'pv-1',
  },
  {
    id: 'pf-2',
    brand_id: 'brand-1',
    source_slug: 'testbrand',
    canonical_domain: 'www.testbrand.com',
    status: 'active',
    active_version_id: 'pv-2',
  },
];

const MOCK_VERSIONS = [
  {
    id: 'pv-1',
    profile_id: 'pf-1',
    version_number: 1,
    status: 'active',
    rules: { fields: { title: { selector: '.product-title' } } },
    compiled_crawl4ai_schema: {
      name: 'testbrand',
      baseSelector: '.product-detail',
      fields: [
        { name: 'product_name', selector: 'h1', type: 'text' },
        { name: 'description', selector: '.desc', type: 'text' },
        { name: 'images', selector: 'img.product-image', type: 'image', attribute: 'src' },
      ],
    },
    version_hash: 'abc123',
  },
  {
    id: 'pv-2',
    profile_id: 'pf-2',
    version_number: 1,
    status: 'active',
    rules: { fields: { price: { selector: '.price' } } },
    compiled_crawl4ai_schema: {
      name: 'testbrand-alt',
      baseSelector: '.main',
      fields: [
        { name: 'product_name', selector: '.name', type: 'text' },
      ],
    },
    version_hash: 'def456',
  },
];

const MOCK_SOURCE_PLAN_OK: SourcePlanResult = {
  ok: true,
  plan: {
    schemaVersion: 'v1',
    upc: 'UPC-1',
    input: { name: 'Test Product', price: 10 },
    brand: { id: 'brand-1', name: 'TestBrand', slug: 'testbrand' },
    extractionMode: 'mixed',
    priority: [
      {
        sourceType: 'official_brand',
        sourceSlug: 'testbrand',
        displayName: 'TestBrand Official',
        domains: ['testbrand.com', 'www.testbrand.com'],
        assetDomains: [],
        adapterSlug: 'official_brand_crawl',
        requiresAuth: false,
        credentialRef: null,
        searchMode: 'domain_search',
        allowedFields: ['title', 'description', 'images'],
        priority: 100,
        runFirst: false,
        resolutionStage: 'official_brand',
      },
    ],
    sourcePolicy: {
      allowedDomains: ['testbrand.com', 'www.testbrand.com'],
      allowedAssetDomains: [],
      disallowedDomains: [],
      approvedSourcesOnly: true,
    },
  },
};

const MOCK_SOURCE_PLAN_NO_BRAND: SourcePlanResult = {
  ok: true,
  plan: {
    schemaVersion: 'v1',
    upc: 'UPC-2',
    input: { name: 'No Brand', price: null },
    brand: null,
    extractionMode: 'mixed',
    priority: [],
    sourcePolicy: {
      allowedDomains: [],
      allowedAssetDomains: [],
      disallowedDomains: [],
      approvedSourcesOnly: true,
    },
  },
};

// =============================================================================
// Tests
// =============================================================================

describe('resolveProfileSnapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves profiles for matching brand/source/domain combinations', async () => {
    const responses = [
      // Query 1: site_extraction_profiles
      { data: MOCK_PROFILES, error: null },
      // Query 2: site_extraction_profile_versions
      { data: MOCK_VERSIONS, error: null },
    ];
    const mockDb = createMockDbForProfileSnapshots(responses);
    const sourcePlans: Record<string, SourcePlanResult> = {
      'UPC-1': MOCK_SOURCE_PLAN_OK,
    };

    const snapshots = await resolveProfileSnapshots(mockDb, sourcePlans);

    // Should have 2 brand-scoped snapshots (one per domain)
    const keys = Object.keys(snapshots);
    expect(keys).toContain('brand-1:testbrand:testbrand.com');
    expect(keys).toContain('brand-1:testbrand:www.testbrand.com');
    expect(keys.length).toBe(2);

    // Verify snapshot structure
    const snapshot = snapshots['brand-1:testbrand:testbrand.com'];
    expect(snapshot.profile_id).toBe('pf-1');
    expect(snapshot.version_id).toBe('pv-1');
    expect(snapshot.version_hash).toBe('abc123');
    expect(snapshot.rules).toEqual(MOCK_VERSIONS[0].rules);
    expect(snapshot.compiled_crawl4ai_schema).toEqual(MOCK_VERSIONS[0].compiled_crawl4ai_schema);
    expect(snapshot.scope).toEqual({
      brand_id: 'brand-1',
      source_slug: 'testbrand',
      canonical_domain: 'testbrand.com',
    });

    // Verify the second domain snapshot
    const snapshot2 = snapshots['brand-1:testbrand:www.testbrand.com'];
    expect(snapshot2.profile_id).toBe('pf-2');
    expect(snapshot2.version_id).toBe('pv-2');
    expect(snapshot2.version_hash).toBe('def456');
  });

  it('returns empty object when no source plans are ok:true', async () => {
    const mockDb = createMockDbForProfileSnapshots([]);
    const sourcePlans: Record<string, SourcePlanResult> = {
      'UPC-1': { ok: false, upc: 'UPC-1', error: 'Product not found', code: 'product_not_found' },
    };

    const snapshots = await resolveProfileSnapshots(mockDb, sourcePlans);
    expect(snapshots).toEqual({});
  });

  it('returns empty object when brand is null in all plans', async () => {
    const mockDb = createMockDbForProfileSnapshots([]);
    const sourcePlans: Record<string, SourcePlanResult> = {
      'UPC-2': MOCK_SOURCE_PLAN_NO_BRAND,
    };

    const snapshots = await resolveProfileSnapshots(mockDb, sourcePlans);
    expect(snapshots).toEqual({});
  });

  it('skips profiles without active_version_id', async () => {
    const profilesNoVersion = [
      {
        id: 'pf-1',
        brand_id: 'brand-1',
        source_slug: 'testbrand',
        canonical_domain: 'testbrand.com',
        status: 'active',
        active_version_id: null, // no active version
      },
    ];
    const responses = [
      // Query 1: site_extraction_profiles — no active_version_id
      { data: profilesNoVersion, error: null },
      // Query 2: site_extraction_profile_versions — not called because no version IDs
      { data: [], error: null },
    ];
    const mockDb = createMockDbForProfileSnapshots(responses);
    const sourcePlans: Record<string, SourcePlanResult> = {
      'UPC-1': MOCK_SOURCE_PLAN_OK,
    };

    const snapshots = await resolveProfileSnapshots(mockDb, sourcePlans);
    expect(snapshots).toEqual({});
  });

  it('returns empty object when profiles table errors', async () => {
    const responses = [
      // Query 1: site_extraction_profiles errors
      { data: null, error: { message: 'Database error' } },
    ];
    const mockDb = createMockDbForProfileSnapshots(responses);
    const sourcePlans: Record<string, SourcePlanResult> = {
      'UPC-1': MOCK_SOURCE_PLAN_OK,
    };

    const snapshots = await resolveProfileSnapshots(mockDb, sourcePlans);
    expect(snapshots).toEqual({});
  });

  it('returns empty object when profiles return empty array', async () => {
    const responses = [
      // Query: site_extraction_profiles returns empty
      { data: [], error: null },
    ];
    const mockDb = createMockDbForProfileSnapshots(responses);
    const sourcePlans: Record<string, SourcePlanResult> = {
      'UPC-1': MOCK_SOURCE_PLAN_OK,
    };

    const snapshots = await resolveProfileSnapshots(mockDb, sourcePlans);
    expect(snapshots).toEqual({});
  });

  it('handles multiple UPCs across same brand', async () => {
    const responses = [
      // Query 1: site_extraction_profiles
      { data: [MOCK_PROFILES[0]], error: null },
      // Query 2: site_extraction_profile_versions
      { data: [MOCK_VERSIONS[0]], error: null },
    ];
    const mockDb = createMockDbForProfileSnapshots(responses);
    const sourcePlans: Record<string, SourcePlanResult> = {
      'UPC-1': MOCK_SOURCE_PLAN_OK,
      'UPC-3': {
        ...MOCK_SOURCE_PLAN_OK,
        plan: {
          ...MOCK_SOURCE_PLAN_OK.plan,
          upc: 'UPC-3',
        },
      },
    };

    const snapshots = await resolveProfileSnapshots(mockDb, sourcePlans);
    // Deduplicated by brandId:sourceSlug:domain — still 1 key
    expect(Object.keys(snapshots)).toContain('brand-1:testbrand:testbrand.com');
    expect(Object.keys(snapshots).length).toBe(1);
  });

  it('handles distributor-only source plans (no brand sources)', async () => {
    const distributorPlan: SourcePlanResult = {
      ok: true,
      plan: {
        schemaVersion: 'v1',
        upc: 'UPC-4',
        input: { name: 'Distributor Product', price: 10 },
        brand: { id: 'brand-2', name: 'AnotherBrand', slug: 'anotherbrand' },
        extractionMode: 'mixed',
        priority: [
          {
            sourceType: 'distributor',
            sourceSlug: 'phillips',
            displayName: 'Phillips',
            domains: ['phillips.com'],
            assetDomains: [],
            adapterSlug: 'phillips_adapter',
            requiresAuth: false,
            credentialRef: null,
            searchMode: 'upc_search',
            allowedFields: ['name', 'description'],
            priority: 10,
            runFirst: false,
          },
        ],
        sourcePolicy: {
          allowedDomains: ['phillips.com'],
          allowedAssetDomains: [],
          disallowedDomains: [],
          approvedSourcesOnly: true,
        },
      },
    };

    const responses = [
      // Query 1: site_extraction_profiles — no profiles match phillips domain
      { data: [], error: null },
    ];
    const mockDb = createMockDbForProfileSnapshots(responses);
    const sourcePlans: Record<string, SourcePlanResult> = {
      'UPC-4': distributorPlan,
    };

    const snapshots = await resolveProfileSnapshots(mockDb, sourcePlans);
    expect(snapshots).toEqual({});
  });
});
