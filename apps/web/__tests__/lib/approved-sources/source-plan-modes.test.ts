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

describe('buildApprovedSourcePlans — extraction modes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findDistributorInCatalog.mockReturnValue(null);
    buildDistributorPlanEntry.mockReturnValue(null);
  });

  function standardResponses() {
    return [
      // 1. products_ingestion
      {
        data: [
          {
            sku: 'SKU-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
            enrichment_config: null,
          },
        ],
        error: null,
      },
      // 2. products_ingestion sources (dedup query)
      {
        data: [],
        error: null,
      },
      // 3. brands
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
      // 3. brand_sources (via .order())
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
            search_mode: 'sku_search',
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
            search_mode: 'sku_search',
            allowed_fields: ['name', 'description', 'images'],
            priority: 2,
            enabled: true,
          },
        ],
        error: null,
      },
    ];
  }

  it('defaults to mixed mode (llmPolicy.enabled = true)', async () => {
    const mockDb = createMockDbForSourcePlan(standardResponses());
    const results = await buildApprovedSourcePlans(mockDb, ['SKU-1']);

    const result = results['SKU-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.plan.llmPolicy.enabled).toBe(true);
    expect(result.plan.priority.length).toBeGreaterThan(0);
  });

  it('distributor_only sets llmPolicy.enabled = false', async () => {
    const mockDb = createMockDbForSourcePlan(standardResponses());
    const results = await buildApprovedSourcePlans(mockDb, ['SKU-1'], {
      extractionMode: 'distributor_only',
    });

    const result = results['SKU-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.plan.llmPolicy.enabled).toBe(false);
    expect(result.plan.priority.length).toBeGreaterThan(0);
  });

  it('ai_only clears priority entries and sets llmPolicy.enabled = true', async () => {
    const mockDb = createMockDbForSourcePlan(standardResponses());
    const results = await buildApprovedSourcePlans(mockDb, ['SKU-1'], {
      extractionMode: 'ai_only',
    });

    const result = results['SKU-1'];
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.plan.llmPolicy.enabled).toBe(true);
    expect(result.plan.priority.length).toBe(0);
  });

  it('distributor_only with no distributors returns error', async () => {
    const responses = [
      {
        data: [
          {
            sku: 'SKU-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
            enrichment_config: null,
          },
        ],
        error: null,
      },
      { data: [], error: null },
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: [],
            preferred_domains: [],
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['SKU-1'], {
      extractionMode: 'distributor_only',
    });

    const result = results['SKU-1'];
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.error).toContain('No approved sources configured');
  });

  it('ai_only with no official domains returns error', async () => {
    const responses = [
      {
        data: [
          {
            sku: 'SKU-1',
            brand_id: 'brand-1',
            input: { name: 'Test Product', price: 10 },
            enrichment_config: null,
          },
        ],
        error: null,
      },
      { data: [], error: null },
      {
        data: [
          {
            id: 'brand-1',
            name: 'TestBrand',
            slug: 'testbrand',
            official_domains: [],
            preferred_domains: [],
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ];

    const mockDb = createMockDbForSourcePlan(responses);
    const results = await buildApprovedSourcePlans(mockDb, ['SKU-1'], {
      extractionMode: 'ai_only',
    });

    const result = results['SKU-1'];
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.error).toContain('AI-only mode requested');
  });
});
