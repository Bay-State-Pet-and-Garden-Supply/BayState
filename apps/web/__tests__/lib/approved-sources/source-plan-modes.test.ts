/**
 * @jest-environment node
 */

import { buildApprovedSourcePlans } from '@/lib/approved-sources/source-plan';
import { createMockDbForSourcePlan } from './test-helpers';

// Mock source-cascade's helpers for plan-building tests
// isCascadeConfigured is tested separately; we control its value here.
// getUntriedAndErroredSources is used for retryMode filtering.
jest.mock('@/lib/approved-sources/source-cascade', () => ({
  ...jest.requireActual('@/lib/approved-sources/source-cascade'),
  isCascadeConfigured: jest.fn(),
  getUntriedAndErroredSources: jest.fn(),
}));

const { isCascadeConfigured, getUntriedAndErroredSources } = jest.requireMock('@/lib/approved-sources/source-cascade');

describe('buildApprovedSourcePlans — automated cascade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: brand cascade is configured (has timestamp + enabled distributors)
    isCascadeConfigured.mockResolvedValue(true);
  });

  /**
   * Build standard response array for a configured brand with 2 sources (distributor + official).
   * Includes the 2 extra isCascadeConfigured responses before the main brand_sources query.
   */
  function standardResponses() {
    return [
      // 1. products_ingestion
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
          },
        ],
        error: null,
      },
      // 2. brands
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: ['testbrand.com'],
            preferred_domains: [],
            source_cascade_configured_at: '2026-06-11T00:00:00Z',
          },
        ],
        error: null,
      },
      // 3. brand_sources main query
      {
        data: [
          {
            id: 'bs-1',
            brand_id: 'brand-1',
            source_type: 'distributor',
            source_slug: 'phillips',
            display_name: 'Phillips',
            domains: ['phillips.com'],
            asset_domains: [],
            crawl4ai_adapter_slug: 'phillips_adapter',
            requires_auth: false,
            credential_ref: null,
            search_mode: 'upc_search',
            allowed_fields: ['name', 'description', 'images'],
            priority: 1,
            enabled: true,
          },
          {
            id: 'bs-2',
            brand_id: 'brand-1',
            source_type: 'official_brand',
            source_slug: 'testbrand',
            display_name: 'Official Brand',
            domains: ['testbrand.com'],
            asset_domains: [],
            crawl4ai_adapter_slug: 'crawl4ai_direct',
            requires_auth: false,
            credential_ref: null,
            search_mode: 'domain_search',
            allowed_fields: ['name', 'description', 'images'],
            priority: 50,
            enabled: true,
          },
        ],
        error: null,
      },
    ];
  }

  // ===========================================================================
  // Cascade-configured brand with all sources
  // ===========================================================================

  it('includes all enabled sources when brand cascade is configured', async () => {
    const mockDb = createMockDbForSourcePlan(standardResponses());
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    // All sources included
    expect(result.plan.priority.length).toBe(2);
    const slugs = result.plan.priority.map(e => e.sourceSlug);
    expect(slugs).toContain('phillips');
    expect(slugs).toContain('testbrand'); // official_brand uses brand slug
  });

  it('orders distributors before official_brand fallback', async () => {
    const mockDb = createMockDbForSourcePlan(standardResponses());
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    // Distributor (priority 1) comes before official_brand (priority 50)
    expect(result.plan.priority[0].sourceSlug).toBe('phillips');
    expect(result.plan.priority[0].sourceType).toBe('distributor');
    // Last entry is official_brand
    const lastEntry = result.plan.priority[result.plan.priority.length - 1];
    expect(lastEntry.sourceType).toBe('official_brand');
  });

  it('sets extractionMode to "mixed" always (no user-facing mode)', async () => {
    const mockDb = createMockDbForSourcePlan(standardResponses());
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.plan.extractionMode).toBe('mixed');
  });

  // ===========================================================================
  // Cascade not configured
  // ===========================================================================

  it('rejects brands without source_cascade_configured_at', async () => {
    isCascadeConfigured.mockResolvedValue(false);

    const responses = [
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: [],
            preferred_domains: [],
            source_cascade_configured_at: null, // NOT configured
          },
        ],
        error: null,
      },
      // brand_sources query is never reached because cascade check fails first
      { data: [], error: null },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.code).toBe('source_cascade_not_configured');
    expect(result.error).toContain('Source cascade not configured');
  });

  // ===========================================================================
  // No sources configured
  // ===========================================================================

  it('returns no_sources_configured when cascade timestamp set but no enabled sources', async () => {
    const responses = [
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: [],
            preferred_domains: [],
            source_cascade_configured_at: '2026-06-11T00:00:00Z',
          },
        ],
        error: null,
      },
      // Empty brand_sources — cascade check passes (mocked), but no sources found
      { data: [], error: null },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.error).toContain('No approved sources configured');
  });

  // ===========================================================================
  // Missing brand returns error before cascade check
  // ===========================================================================

  it('rejects products without brand_id before cascade check', async () => {
    const responses = [
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: null,
            input: { name: 'No Brand', price: 10 },
          },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.code).toBe('missing_brand');
  });

  // ===========================================================================
  // Official brand fallback synthesized from brand domains
  // ===========================================================================

  it('synthesizes official_brand entry from brand official_domains when missing from brand_sources', async () => {
    const responses = [
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: ['testbrand.com'],
            preferred_domains: [],
            source_cascade_configured_at: '2026-06-11T00:00:00Z',
          },
        ],
        error: null,
      },
      // Only distributor sources, no official_brand
      {
        data: [
          {
            id: 'bs-1',
            brand_id: 'brand-1',
            source_type: 'distributor',
            source_slug: 'phillips',
            display_name: 'Phillips',
            domains: ['phillips.com'],
            asset_domains: [],
            crawl4ai_adapter_slug: 'phillips_adapter',
            requires_auth: false,
            credential_ref: null,
            search_mode: 'upc_search',
            allowed_fields: ['name', 'description', 'images'],
            priority: 10,
            enabled: true,
          },
        ],
        error: null,
      },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    // Should include phillips (distributor) + synthesized official_brand fallback
    expect(result.plan.priority.length).toBe(2);
    // Last entry should be the synthesized official_brand
    const lastEntry = result.plan.priority[result.plan.priority.length - 1];
    expect(lastEntry.sourceType).toBe('official_brand');
    expect(lastEntry.sourceSlug).toBe('testbrand');
    expect(lastEntry.domains).toContain('testbrand.com');
    // Synthesized official_brand should have very low priority (terminal fallback)
    expect(lastEntry.priority).toBe(1000);
  });

  it('does not synthesize official_brand when brand has no official_domains', async () => {
    const responses = [
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: [],
            preferred_domains: [],
            source_cascade_configured_at: '2026-06-11T00:00:00Z',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'bs-1',
            brand_id: 'brand-1',
            source_type: 'distributor',
            source_slug: 'phillips',
            display_name: 'Phillips',
            domains: ['phillips.com'],
            asset_domains: [],
            crawl4ai_adapter_slug: 'phillips_adapter',
            requires_auth: false,
            credential_ref: null,
            search_mode: 'upc_search',
            allowed_fields: ['name', 'description', 'images'],
            priority: 10,
            enabled: true,
          },
        ],
        error: null,
      },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    // Only the distributor — no official_brand fallback since no domains to use
    expect(result.plan.priority.length).toBe(1);
    expect(result.plan.priority[0].sourceSlug).toBe('phillips');
  });

  // ===========================================================================
  // retryMode: failed_or_untried
  // ===========================================================================

  it('retryMode=all includes all sources (same as default)', async () => {
    getUntriedAndErroredSources.mockResolvedValue(['phillips', 'testbrand']);

    const mockDb = createMockDbForSourcePlan(standardResponses());
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      retryMode: 'all',
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.plan.priority.length).toBe(2);
    expect(getUntriedAndErroredSources).not.toHaveBeenCalled();
  });

  it('retryMode=failed_or_untried filters to only errored/untried sources', async () => {
    // Mock only orgill needs retry (had source_error)
    getUntriedAndErroredSources.mockResolvedValue(['orgill']);

    const responses = [
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: [],
            preferred_domains: [],
            source_cascade_configured_at: '2026-06-11T00:00:00Z',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'bs-1',
            brand_id: 'brand-1',
            source_type: 'distributor',
            source_slug: 'phillips',
            display_name: 'Phillips',
            domains: ['phillips.com'],
            asset_domains: [],
            crawl4ai_adapter_slug: 'phillips_adapter',
            requires_auth: false,
            credential_ref: null,
            search_mode: 'upc_search',
            allowed_fields: ['name', 'description', 'images'],
            priority: 10,
            enabled: true,
          },
          {
            id: 'bs-2',
            brand_id: 'brand-1',
            source_type: 'distributor',
            source_slug: 'orgill',
            display_name: 'Orgill',
            domains: ['orgill.com'],
            asset_domains: [],
            crawl4ai_adapter_slug: 'orgill_adapter',
            requires_auth: false,
            credential_ref: null,
            search_mode: 'upc_search',
            allowed_fields: ['name', 'description', 'images'],
            priority: 20,
            enabled: true,
          },
        ],
        error: null,
      },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      retryMode: 'failed_or_untried',
    });

    expect(getUntriedAndErroredSources).toHaveBeenCalledWith(
      expect.anything(),
      'UPC-1',
      ['phillips', 'orgill'],
    );

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    // Only orgill should be in the plan (failed sources for retry)
    expect(result.plan.priority.length).toBe(1);
    expect(result.plan.priority[0].sourceSlug).toBe('orgill');
  });

  // ===========================================================================
  // Product not found
  // ===========================================================================

  it('returns error for non-existent UPCs', async () => {
    const responses = [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['NONEXISTENT']);

    const result = results['NONEXISTENT'];
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.code).toBe('product_not_found');
  });

  it('rejects when product.brand_id is null', async () => {
    const responses = [
      // 1. products_ingestion (direct brand_id is required)
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: null,
            input: { name: 'Brandless Product', price: 10 },
          },
        ],
        error: null,
      },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

    const result = results['UPC-1'];
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.code).toBe('missing_brand');
  });

  // ===========================================================================
  // UPC Resolution V2 source plan synthesis
  // ===========================================================================

  describe('UPC Resolution V2 source plan', () => {
    it('synthesizes official_brand_crawl and serp_candidate entries when V2 enabled', async () => {
      const responses = [
        {
          data: [
            {
              upc: 'UPC-1',
              brand_id: 'brand-1',
              input: { name: 'Test Product', price: 10 },
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'brand-1',
              name: 'TestBrand',
              slug: 'testbrand',
              official_domains: ['testbrand.com'],
              preferred_domains: [],
              source_cascade_configured_at: '2026-06-11T00:00:00Z',
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'bs-1',
              brand_id: 'brand-1',
              source_type: 'distributor',
              source_slug: 'phillips',
              display_name: 'Phillips',
              domains: ['phillips.com'],
              asset_domains: [],
              crawl4ai_adapter_slug: 'phillips_adapter',
              requires_auth: false,
              credential_ref: null,
              search_mode: 'upc_search',
              allowed_fields: ['name', 'description', 'images'],
              priority: 10,
              enabled: true,
            },
          ],
          error: null,
        },
      ];

      const mockDb = createMockDbForSourcePlan(responses);
      const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
        upcResolutionV2Enabled: true,
      });

      const result = results['UPC-1'];
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');

      // Should have: phillips (distributor) + official_brand_crawl + serp_candidate
      expect(result.plan.priority.length).toBe(3);

      // First entry: distributor (phillips)
      expect(result.plan.priority[0].sourceType).toBe('distributor');
      expect(result.plan.priority[0].sourceSlug).toBe('phillips');

      // Second entry: official_brand_crawl with resolutionStage 'official_brand'
      const obEntry = result.plan.priority[1];
      expect(obEntry.sourceType).toBe('official_brand');
      expect(obEntry.adapterSlug).toBe('official_brand_crawl');
      expect(obEntry.resolutionStage).toBe('official_brand');
      expect(obEntry.domains).toContain('testbrand.com');
      expect(obEntry.priority).toBe(100);

      // Third entry: serp_candidate_discovery with resolutionStage 'serp'
      const serpEntry = result.plan.priority[2];
      expect(serpEntry.sourceType).toBe('official_brand');
      expect(serpEntry.adapterSlug).toBe('serp_candidate_discovery');
      expect(serpEntry.resolutionStage).toBe('serp');
      expect(serpEntry.domains).toContain('testbrand.com');
      expect(serpEntry.priority).toBe(500);

      // Fix 6: sourcePolicy.allowedDomains must include official brand domains
      expect(result.plan.sourcePolicy.allowedDomains).toContain('testbrand.com');
      expect(result.plan.sourcePolicy.allowedDomains).toContain('phillips.com');
    });

    it('overrides existing official_brand sources to official_brand_crawl in V2 mode', async () => {
      const responses = [
        {
          data: [
            {
              upc: 'UPC-1',
              brand_id: 'brand-1',
              input: { name: 'Test Product', price: 10 },
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'brand-1',
              name: 'TestBrand',
              slug: 'testbrand',
              official_domains: ['testbrand.com'],
              preferred_domains: [],
              source_cascade_configured_at: '2026-06-11T00:00:00Z',
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'bs-1',
              brand_id: 'brand-1',
              source_type: 'distributor',
              source_slug: 'phillips',
              display_name: 'Phillips',
              domains: ['phillips.com'],
              asset_domains: [],
              crawl4ai_adapter_slug: 'phillips_adapter',
              requires_auth: false,
              credential_ref: null,
              search_mode: 'upc_search',
              allowed_fields: ['name', 'description', 'images'],
              priority: 10,
              enabled: true,
            },
            {
              id: 'bs-2',
              brand_id: 'brand-1',
              source_type: 'official_brand',
              source_slug: 'existing-official',
              display_name: 'Existing Official',
              domains: ['existing-brand.com'],
              asset_domains: [],
              crawl4ai_adapter_slug: 'crawl4ai_direct',
              requires_auth: false,
              credential_ref: null,
              search_mode: 'domain_search',
              allowed_fields: ['title', 'description', 'images'],
              priority: 50,
              enabled: true,
            },
          ],
          error: null,
        },
      ];

      const mockDb = createMockDbForSourcePlan(responses);
      const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
        upcResolutionV2Enabled: true,
      });

      const result = results['UPC-1'];
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');

      // Find the official_brand entry that was overridden
      const obEntry = result.plan.priority.find(
        (e: { sourceType: string; sourceSlug: string }) => e.sourceType === 'official_brand' && e.sourceSlug === 'existing-official'
      );
      expect(obEntry).toBeDefined();
      expect(obEntry!.adapterSlug).toBe('official_brand_crawl');
      expect(obEntry!.resolutionStage).toBe('official_brand');

      // Should also have serp_candidate_discovery entry
      const serpEntry = result.plan.priority.find(
        (e: { adapterSlug: string }) => e.adapterSlug === 'serp_candidate_discovery'
      );
      expect(serpEntry).toBeDefined();
      expect(serpEntry!.adapterSlug).toBe('serp_candidate_discovery');

      // Fix 6: SERP candidate domains must be in sourcePolicy.allowedDomains
      // even when an existing official brand source already exists.
      expect(result.plan.sourcePolicy.allowedDomains).toContain('testbrand.com');
      expect(result.plan.sourcePolicy.allowedDomains).toContain('existing-brand.com');
      expect(result.plan.sourcePolicy.allowedDomains).toContain('phillips.com');
    });

    it('preserves legacy behavior when upcResolutionV2Enabled is not set', async () => {
      // Same setup as 'synthesizes official_brand entry from brand official_domains' legacy test
      const responses = [
        {
          data: [
            {
              upc: 'UPC-1',
              brand_id: 'brand-1',
              input: { name: 'Test Product', price: 10 },
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'brand-1',
              name: 'TestBrand',
              slug: 'testbrand',
              official_domains: ['testbrand.com'],
              preferred_domains: [],
              source_cascade_configured_at: '2026-06-11T00:00:00Z',
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'bs-1',
              brand_id: 'brand-1',
              source_type: 'distributor',
              source_slug: 'phillips',
              display_name: 'Phillips',
              domains: ['phillips.com'],
              asset_domains: [],
              crawl4ai_adapter_slug: 'phillips_adapter',
              requires_auth: false,
              credential_ref: null,
              search_mode: 'upc_search',
              allowed_fields: ['name', 'description', 'images'],
              priority: 10,
              enabled: true,
            },
          ],
          error: null,
        },
      ];

      const mockDb = createMockDbForSourcePlan(responses);
      // No upcResolutionV2Enabled — should use legacy synthesis
      const results = await buildApprovedSourcePlans(mockDb, ['UPC-1']);

      const result = results['UPC-1'];
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');

      // Legacy: 2 entries (distributor + synthesized crawl4ai_direct fallback)
      expect(result.plan.priority.length).toBe(2);
      const lastEntry = result.plan.priority[result.plan.priority.length - 1];
      expect(lastEntry.sourceType).toBe('official_brand');
      expect(lastEntry.adapterSlug).toBe('crawl4ai_direct'); // legacy SERP fallback
      expect(lastEntry.resolutionStage).toBeUndefined(); // no V2 stage
    });

    it('does not add serp_candidate when brand has no official_domains in V2 mode', async () => {
      const responses = [
        {
          data: [
            {
              upc: 'UPC-1',
              brand_id: 'brand-1',
              input: { name: 'Test Product', price: 10 },
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'brand-1',
              name: 'TestBrand',
              slug: 'testbrand',
              official_domains: [],
              preferred_domains: [],
              source_cascade_configured_at: '2026-06-11T00:00:00Z',
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'bs-1',
              brand_id: 'brand-1',
              source_type: 'distributor',
              source_slug: 'phillips',
              display_name: 'Phillips',
              domains: ['phillips.com'],
              asset_domains: [],
              crawl4ai_adapter_slug: 'phillips_adapter',
              requires_auth: false,
              credential_ref: null,
              search_mode: 'upc_search',
              allowed_fields: ['name', 'description', 'images'],
              priority: 10,
              enabled: true,
            },
          ],
          error: null,
        },
      ];

      const mockDb = createMockDbForSourcePlan(responses);
      const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
        upcResolutionV2Enabled: true,
      });

      const result = results['UPC-1'];
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');

      // Only the distributor — no V2 stages since no official domains
      expect(result.plan.priority.length).toBe(1);
      expect(result.plan.priority[0].sourceSlug).toBe('phillips');
    });
  });
});
