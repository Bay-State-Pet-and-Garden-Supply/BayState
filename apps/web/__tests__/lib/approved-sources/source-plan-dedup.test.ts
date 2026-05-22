/**
 * @jest-environment node
 */

import { buildApprovedSourcePlans } from '@/lib/approved-sources/source-plan';
import { createMockDbForSourcePlan } from './test-helpers';

jest.mock('@/lib/approved-sources/distributor-catalog', () => ({
  normalizeDistributorSlug: (slug: string) => slug,
  findDistributorInCatalog: jest.fn(),
  buildDistributorPlanEntry: jest.fn(),
}));

const { findDistributorInCatalog, buildDistributorPlanEntry } = require('@/lib/approved-sources/distributor-catalog');

describe('buildApprovedSourcePlans — dedup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findDistributorInCatalog.mockReturnValue(null);
    buildDistributorPlanEntry.mockReturnValue(null);
  });

  function standardBrandSources() {
    return [
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
        source_slug: 'official_brand',
        display_name: 'Official Brand',
        domains: ['testbrand.com'],
        asset_domains: [],
        crawl4ai_adapter_slug: 'crawl4ai_direct',
        requires_auth: false,
        credential_ref: null,
        search_mode: 'upc_search',
        allowed_fields: ['name', 'description', 'images'],
        priority: 2,
        enabled: true,
      },
    ];
  }

  function standardResponses(existingSources?: any, forceRefresh: boolean = false) {
    const responses: any[] = [
      // 1. products_ingestion
      {
        data: [
          {
            upc: 'UPC-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
            enrichment_config: null,
          },
        ],
        error: null,
      },
    ];

    // 2. products_ingestion sources (dedup query) — only when forceRefresh is false
    if (!forceRefresh && existingSources !== undefined) {
      responses.push({
        data: existingSources,
        error: null,
      });
    }

    responses.push(
      // brands
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: ['testbrand.com'],
            preferred_domains: [],
          },
        ],
        error: null,
      },
      // brand_sources
      {
        data: standardBrandSources(),
        error: null,
      }
    );

    return responses;
  }

  function makeRecentEnriched(sourceSlug: string, confidence: number = 0.8) {
    return {
      upc: 'UPC-1',
      sources: {
        enriched: {
          schema_version: 'v1',
          name: 'Test Product',
          images: ['https://example.com/img1.jpg'],
          extracted_at: new Date().toISOString(),
          source_results: [
            {
              sourceSlug,
              sourceType: sourceSlug === 'official_brand' ? 'official_brand' : 'distributor',
              confidence,
              matchedFields: ['name', 'images'],
            },
          ],
        },
      },
    };
  }

  it('skips recently successful sources when forceRefresh is false', async () => {
    const responses = standardResponses([makeRecentEnriched('phillips')]);
    const mockDb = createMockDbForSourcePlan(responses);

    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      forceRefresh: false,
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    const slugs = result.plan.priority.map((e: any) => e.sourceSlug);
    expect(slugs).not.toContain('phillips');
    expect(slugs).toContain('official_brand');
  });

  it('includes all sources when forceRefresh is true', async () => {
    const responses = standardResponses([makeRecentEnriched('phillips')], true);
    const mockDb = createMockDbForSourcePlan(responses);

    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      forceRefresh: true,
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    const slugs = result.plan.priority.map((e: any) => e.sourceSlug);
    expect(slugs).toContain('phillips');
    expect(slugs).toContain('official_brand');
  });

  it('does not skip sources with stale data (>48h)', async () => {
    const stale = makeRecentEnriched('phillips');
    stale.sources.enriched.extracted_at = new Date(
      Date.now() - 49 * 60 * 60 * 1000,
    ).toISOString();

    const responses = standardResponses([stale]);
    const mockDb = createMockDbForSourcePlan(responses);

    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      forceRefresh: false,
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    const slugs = result.plan.priority.map((e: any) => e.sourceSlug);
    expect(slugs).toContain('phillips');
  });

  it('does not skip sources with missing name', async () => {
    const missingName = makeRecentEnriched('phillips');
    missingName.sources.enriched.name = '';

    const responses = standardResponses([missingName]);
    const mockDb = createMockDbForSourcePlan(responses);

    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      forceRefresh: false,
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    const slugs = result.plan.priority.map((e: any) => e.sourceSlug);
    expect(slugs).toContain('phillips');
  });

  it('does not skip sources with missing images', async () => {
    const missingImages = makeRecentEnriched('phillips');
    missingImages.sources.enriched.images = [];

    const responses = standardResponses([missingImages]);
    const mockDb = createMockDbForSourcePlan(responses);

    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      forceRefresh: false,
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    const slugs = result.plan.priority.map((e: any) => e.sourceSlug);
    expect(slugs).toContain('phillips');
  });

  it('does not skip sources with low confidence (<0.6)', async () => {
    const lowConfidence = makeRecentEnriched('phillips', 0.5);
    const responses = standardResponses([lowConfidence]);
    const mockDb = createMockDbForSourcePlan(responses);

    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      forceRefresh: false,
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    const slugs = result.plan.priority.map((e: any) => e.sourceSlug);
    expect(slugs).toContain('phillips');
  });

  it('skips official_brand source when recently successful', async () => {
    const responses = standardResponses([makeRecentEnriched('official_brand')]);
    const mockDb = createMockDbForSourcePlan(responses);

    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      forceRefresh: false,
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    const slugs = result.plan.priority.map((e: any) => e.sourceSlug);
    expect(slugs).not.toContain('official_brand');
    expect(slugs).toContain('phillips');
  });

  it('returns all_sources_fresh when the selected distributor was skipped by dedup', async () => {
    const responses = standardResponses([makeRecentEnriched('phillips')]);
    const mockDb = createMockDbForSourcePlan(responses);

    const results = await buildApprovedSourcePlans(mockDb, ['UPC-1'], {
      forceRefresh: false,
      extractionMode: 'distributor_only',
      selectedDistributorSlug: 'phillips',
    });

    const result = results['UPC-1'];
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.code).toBe('all_sources_fresh');
    expect(result.error).toContain('already enriched within 48h');
  });
});
