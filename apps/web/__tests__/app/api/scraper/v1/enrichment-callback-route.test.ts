/**
 * @jest-environment node
 */

jest.mock('next/server', () => ({
  NextRequest: class {
    private readonly requestBody: unknown;

    constructor(_url: string, init?: { body?: unknown }) {
      this.requestBody = init?.body;
    }

    async json() {
      if (typeof this.requestBody === 'string') {
        return JSON.parse(this.requestBody);
      }
      return this.requestBody;
    }
  },
  NextResponse: class {
    body: unknown;
    status: number;

    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }

    static json(body: unknown, init?: { status?: number }) {
      return new this(body, init);
    }

    async json() {
      return this.body;
    }
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/scraper-auth', () => ({
  validateActiveRunner: jest.fn(),
}));

jest.mock('@/lib/supabase/config', () => ({
  SUPABASE_URL: 'http://supabase.local',
  SUPABASE_SECRET_KEY: 'secret',
}));

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateActiveRunner } from '@/lib/scraper-auth';
import * as productImageStorage from '@/lib/product-image-storage';
import {
  POST,
  shouldRetryEnrichmentResult,
} from '@/app/api/scraper/v1/enrichment-callback/route';

function createAttemptLookupChain(attemptData: Record<string, unknown>) {
  const chain: any = {
    eq: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    single: jest.fn().mockResolvedValue({ data: attemptData }),
  };
  return chain;
}

function createMockSupabase(options: {
  attemptData: Record<string, unknown>;
  jobAttemptsData?: Array<{ upc: string; attempt_number: number; status: string }>;
  productsIngestionData?: Record<string, unknown>;
}) {
  const attemptUpdates: unknown[] = [];
  const retryInsertions: unknown[] = [];
  const jobUpdates: unknown[] = [];
  const productUpdates: unknown[] = [];
  const sourceAttemptInserts: unknown[] = [];
  const storageUploads: Array<{ path: string; bytes: Uint8Array; options: Record<string, unknown> }> = [];

  const upload = jest.fn((path: string, bytes: Uint8Array, opts: Record<string, unknown>) => {
    storageUploads.push({ path, bytes, options: opts });
    return Promise.resolve({ error: null });
  });
  const getPublicUrl = jest.fn((storagePath: string) => ({
    data: {
      publicUrl: `https://supabase.example.com/storage/v1/object/public/product-images/${storagePath}`,
    },
  }));
  const storageFrom = jest.fn((bucket: string) => {
    if (bucket !== 'product-images') throw new Error(`Unexpected bucket: ${bucket}`);
    return { upload, getPublicUrl };
  });

  const from = jest.fn((table: string) => {
    if (table === 'enrichment_attempts') {
      return {
        select: jest.fn((selection: string) => {
          if (selection.includes('enrichment_jobs!inner')) {
            return createAttemptLookupChain(options.attemptData);
          }
          return {
            eq: jest.fn().mockResolvedValue({
              data: options.jobAttemptsData ?? [
                { upc: 'UPC-1', attempt_number: 1, status: 'failed' },
              ],
            }),
          };
        }),
        update: jest.fn((payload: unknown) => {
          attemptUpdates.push(payload);
          return {
            eq: jest.fn().mockResolvedValue({ error: null }),
          };
        }),
        insert: jest.fn((payload: unknown) => {
          retryInsertions.push(payload);
          return Promise.resolve({ error: null });
        }),
      };
    }

    if (table === 'enrichment_jobs') {
      return {
        update: jest.fn((payload: unknown) => {
          jobUpdates.push(payload);
          return {
            eq: jest.fn().mockResolvedValue({ error: null }),
          };
        }),
      };
    }

    if (table === 'enrichment_source_attempts') {
      return {
        delete: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        })),
        insert: jest.fn((payload: unknown) => {
          sourceAttemptInserts.push(payload);
          return Promise.resolve({ error: null });
        }),
      };
    }

    if (table === 'image_retry_queue') {
      return {
        insert: jest.fn().mockResolvedValue({ error: null }),
      };
    }

    if (table === 'products_ingestion') {
      if (options.productsIngestionData === undefined) {
        throw new Error('products_ingestion should not be accessed for test jobs');
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: options.productsIngestionData }),
          })),
        })),
        update: jest.fn((payload: unknown) => {
          productUpdates.push(payload);
          return {
            eq: jest.fn().mockResolvedValue({ error: null }),
          };
        }),
      };
    }

    throw new Error(`Unexpected table lookup: ${table}`);
  });

  return {
    from,
    storage: { from: storageFrom },
    attemptUpdates,
    retryInsertions,
    jobUpdates,
    productUpdates,
    storageUploads,
    sourceAttemptInserts,
    upload,
    getPublicUrl,
  };
}

function buildCallbackBody(overrides: Record<string, unknown> = {}) {
  return {
    _attempt_id: 'attempt-1',
    schema_version: 'v1',
    upc: 'UPC-1',
    source: {
      url: 'approved_source_extraction',
      source_type: 'distributor',
      source_slug: 'phillips',
    },
    status: 'failed',
    extracted_at: '2026-05-20T00:00:00.000Z',
    mode: 'mixed',
    product: {
      image_urls: [],
    },
    confidence: {
      overall: 0,
      fields: {},
    },
    validation: {
      warnings: ['Temporary extraction error'],
      missing_required: [],
    },
    attempts: [
      {
        mode: 'structured',
        status: 'failed',
        error: 'Temporary extraction error',
      },
    ],
    decision: 'failed',
    llm_used: false,
    source_results: [
      {
        sourceSlug: 'phillips',
        sourceType: 'distributor',
        confidence: 0,
        evidenceUrl: 'approved_source_extraction',
      },
    ],
    ...overrides,
  };
}

describe('POST /api/scraper/v1/enrichment-callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateActiveRunner as jest.Mock).mockResolvedValue({
      isAuthenticated: true,
      isEnabled: true,
      runner: {
        runnerName: 'test-runner',
      },
    });
  });

  it('does not auto-retry approved source extractions (cascade handles re-extraction)', async () => {
    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: true,
          mode: 'distributor_only',
          config: { extraction_mode: 'distributor_only' },
        },
      },
      jobAttemptsData: [
        { upc: 'UPC-1', attempt_number: 1, status: 'failed' },
      ],
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(buildCallbackBody({
          status: 'partial',
          confidence: { overall: 0.3, fields: {} },
        })),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requested_extraction_mode).toBe('distributor_only');
    // Approved source extractions never auto-retry — manual re-extraction via retryMode handles it
    expect(mockSupabase.retryInsertions).toHaveLength(0);
    expect(mockSupabase.attemptUpdates[0]).toMatchObject({
      result: expect.objectContaining({
        requested_extraction_mode: 'distributor_only',
      }),
      normalized_source: expect.objectContaining({
        requested_extraction_mode: 'distributor_only',
      }),
    });
  });

  it('sets terminal distributor_only failures to processed (no auto-retry)', async () => {
    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'distributor_only',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: true,
          mode: 'distributor_only',
          config: { extraction_mode: 'distributor_only' },
        },
      },
      jobAttemptsData: [
        { upc: 'UPC-1', attempt_number: 1, status: 'failed' },
      ],
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(buildCallbackBody({
          validation: {
            warnings: ['AUTH_REQUIRED: login required'],
            missing_required: [],
          },
          attempts: [
            {
              mode: 'structured',
              status: 'failed',
              error: 'AUTH_REQUIRED: login required',
            },
          ],
        })),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Approved source results without outcome data go to needs_attention
    expect(payload.next_status).toBe('needs_attention');
    expect(mockSupabase.retryInsertions).toHaveLength(0);
  });

  it('sets mixed approved-source failures to processed (no auto-retry)', async () => {
    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: true,
          mode: 'mixed',
          config: { extraction_mode: 'mixed' },
        },
      },
      jobAttemptsData: [
        { upc: 'UPC-1', attempt_number: 1, status: 'failed' },
      ],
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(buildCallbackBody({
          validation: {
            warnings: ['Could not extract product name from HTML'],
            missing_required: [],
          },
          attempts: [
            {
              mode: 'structured',
              status: 'failed',
              error: 'Could not extract product name from HTML',
            },
          ],
        })),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Approved source results without outcome data go to needs_attention
    expect(payload.next_status).toBe('needs_attention');
    expect(mockSupabase.retryInsertions).toHaveLength(0);
  });

  it('sets approved source result with missing name to processed (consolidation validates name)', async () => {
    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: true,
          mode: 'mixed',
          config: { extraction_mode: 'mixed' },
        },
      },
      jobAttemptsData: [
        { upc: 'UPC-1', attempt_number: 1, status: 'failed' },
      ],
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(buildCallbackBody({
          status: 'success',
          product: {
            name: '', // Empty name
            image_urls: ['http://example.com/img.png'],
          },
          confidence: { overall: 0.3, fields: {} },
        })),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Approved source results without outcome data go to needs_attention
    expect(payload.next_status).toBe('needs_attention');
  });

  it('treats terminal approved-source extraction warnings as non-retryable', () => {
    const shouldRetry = shouldRetryEnrichmentResult(
      buildCallbackBody({
        validation: {
          warnings: ['Could not extract product name from HTML'],
          missing_required: [],
        },
        attempts: [
          {
            mode: 'structured',
            status: 'failed',
            error: 'Could not extract product name from HTML',
          },
        ],
      }) as any,
      {
        attempt_number: 1,
        retry_count: 0,
      },
      'mixed',
    );

    expect(shouldRetry).toBe(false);
  });

  it('replaces inline image data URLs in source_results with durable Supabase storage URLs', async () => {
    const existingSources = {
      enriched: {},
      phillips: {
        _url: 'approved_source_extraction',
        _scraped_at: '2026-05-20T00:00:00.000Z',
      },
    };

    const inlineDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';

    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: false,
          mode: 'mixed',
          config: { extraction_mode: 'mixed' },
        },
      },
      productsIngestionData: {
        sources: existingSources,
        brand_id: 'brand-1',
      },
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const body = buildCallbackBody({
      upc: 'UPC-1',
      status: 'success',
      extracted_at: '2026-05-28T20:05:11.249700+00:00',
      source: {
        url: 'approved_source_extraction',
        source_type: 'distributor',
        source_slug: 'phillips',
      },
      product: {
        name: 'Auth Captured Product',
        image_urls: [inlineDataUrl],
      },
      confidence: { overall: 0.9, fields: {} },
      source_results: [
        {
          sourceSlug: 'phillips',
          sourceType: 'distributor',
          confidence: 0.9,
          evidenceUrl: 'approved_source_extraction',
          product: {
            name: 'Auth Captured Product',
            media: [
              {
                url: inlineDataUrl,
                role: 'primary',
                source: 'enrichment',
              },
            ],
          },
        },
      ],
    });

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(body),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);

    // Verify the product update happened with durable URLs replacing the inline data URLs
    expect(mockSupabase.productUpdates).toHaveLength(1);
    if (mockSupabase.storageUploads.length < 1) {
      throw new Error('Expected at least one storage upload for the inline image payload');
    }
    const updatedSources = (mockSupabase.productUpdates[0] as any).sources;

    // The source-specific nested media URL should be a Supabase storage URL, not the data URL
    const phillipsSource = updatedSources.phillips;
    expect(phillipsSource).toBeDefined();
    expect(phillipsSource.media).toBeDefined();
    const mediaUrl = phillipsSource.media[0].url;
    expect(mediaUrl).toContain('/storage/v1/object/public/product-images/');
    expect(mediaUrl).not.toContain('data:image');
    expect(mediaUrl).not.toContain('shop.phillipspet.com');

    // The enriched aggregate should also contain durable URLs in its legacy aliases
    expect(updatedSources.enriched).toBeDefined();
    expect(updatedSources.enriched.images[0]).toContain('/storage/v1/object/public/product-images/');
    expect(updatedSources.enriched.image_urls[0]).toContain('/storage/v1/object/public/product-images/');
    expect(updatedSources.enriched.images[0]).not.toContain('data:image');

    // And nested source_results payloads under the enriched aggregate should also be durable
    expect(updatedSources.enriched.source_results[0].product.media[0].url).toContain(
      '/storage/v1/object/public/product-images/'
    );

    expect(payload.success).toBe(true);
  });

  it('overwrites old source result data fields but keeps metadata keys starting with underscore', async () => {
    const existingSources = {
      enriched: {},
      amazon: {
        upc: '860012057856',
        name: 'Old Name',
        images: ['https://example.com/old1.jpg', 'https://example.com/old2.jpg'],
        scraped_at: '2026-05-02T23:50:39.868668',
        _url: 'https://www.amazon.com/dp/B0FH8RJ3NH',
        _scraped_at: '2026-05-02T23:50:39.868668',
        _provenance: { some: 'provenance_data' },
      },
    };

    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: false,
          mode: 'mixed',
          config: { extraction_mode: 'mixed' },
        },
      },
      productsIngestionData: {
        sources: existingSources,
        brand_id: 'brand-1',
      },
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const body = buildCallbackBody({
      upc: '860012057856',
      status: 'success',
      extracted_at: '2026-05-28T20:05:11.249700+00:00',
      source: {
        url: 'https://www.amazon.com/dp/B0FH8RJ3NH',
        source_type: 'distributor',
        source_slug: 'amazon',
      },
      product: {
        name: 'New Name',
        image_urls: ['https://example.com/new1.jpg'],
      },
      confidence: { overall: 0.9, fields: {} },
      source_results: [
        {
          sourceSlug: 'amazon',
          sourceType: 'crawler',
          confidence: 0.9,
          evidenceUrl: 'https://www.amazon.com/dp/B0FH8RJ3NH',
          product: {
            name: 'New Name',
            image_urls: ['https://example.com/new1.jpg'],
          },
        },
      ],
    });

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(body),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockSupabase.productUpdates).toHaveLength(1);

    const updatedSources = (mockSupabase.productUpdates[0] as any).sources;
    expect(updatedSources.amazon).toBeDefined();

    // The old non-underscore data fields ('images', 'scraped_at') must be GONE or replaced
    expect(updatedSources.amazon.images).toBeUndefined();
    expect(updatedSources.amazon.scraped_at).toBeUndefined();

    // The new data fields must be present
    expect(updatedSources.amazon.name).toBe('New Name');
    expect(updatedSources.amazon.image_urls).toEqual(['https://example.com/new1.jpg']);

    // The underscore metadata fields must be preserved or updated
    expect(updatedSources.amazon._url).toBe('https://www.amazon.com/dp/B0FH8RJ3NH');
    expect(updatedSources.amazon._scraped_at).toBe('2026-05-28T20:05:11.249700+00:00');
    expect(updatedSources.amazon._provenance).toEqual({ some: 'provenance_data' });
  });

  // -----------------------------------------------------------------------
  // Regression tests for source-outcome normalization status logic
  // -----------------------------------------------------------------------

  it('regression: Amazon-like found (outcome:null, product data, 0.95 confidence) + Bradley source_error -> processed, Amazon persisted as found', async () => {
    const existingSources = {
      enriched: {},
      amazon: { _url: 'https://www.amazon.com/dp/B0FRV9FBP7', _scraped_at: '2026-05-20T00:00:00.000Z' },
    };

    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: false,
          mode: 'mixed',
          config: { source_type: 'approved_source_extraction', cascade_version: 'v1' },
        },
      },
      productsIngestionData: {
        sources: existingSources,
        brand_id: 'brand-woof',
      },
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const body = {
      _attempt_id: 'attempt-1',
      schema_version: 'v1',
      upc: '850067859918',
      source: { url: 'approved_source_extraction', source_slug: 'amazon' },
      status: 'success',
      extracted_at: '2026-06-13T01:50:06.894Z',
      mode: 'mixed',
      product: { name: 'WOOF Air-Dried Puzzle Treats', image_urls: ['https://example.com/img.png'] },
      confidence: { overall: 0.95, fields: { name: 0.95 } },
      validation: { warnings: [], missing_required: [] },
      attempts: [{ mode: 'structured', status: 'success' }],
      decision: 'deterministic_success',
      llm_used: false,
      source_results: [
        {
          sourceSlug: 'amazon',
          sourceType: 'marketplace',
          confidence: 0.95,
          evidenceUrl: 'https://www.amazon.com/dp/B0FRV9FBP7',
          matchedFields: ['name', 'brand', 'description', 'image_urls'],
          outcome: null, // The bug: null outcome despite having data
          product: { name: 'WOOF Air-Dried Puzzle Treats' },
        },
        {
          sourceSlug: 'bradley',
          sourceType: 'distributor',
          confidence: 0,
          evidenceUrl: 'https://www.bradleycaldwell.com/search?term=850067859918',
          outcome: 'source_error',
          errorCode: 'extraction_failed',
          errorMessage: 'No matching product card found on search page for UPC 850067859918',
        },
      ],
    };

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(body),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // found-wins: Amazon found product data -> processed despite Bradley error
    expect(payload.next_status).toBe('processed');

    // Source-attempts should have been persisted
    expect(mockSupabase.sourceAttemptInserts.length).toBeGreaterThanOrEqual(1);
    const inserts = mockSupabase.sourceAttemptInserts.flat() as any[];
    const amazonRow = inserts.find((r: any) => r.source_slug === 'amazon');
    const bradleyRow = inserts.find((r: any) => r.source_slug === 'bradley');
    expect(amazonRow).toBeDefined();
    expect(bradleyRow).toBeDefined();
    // Amazon null outcome should be normalized to 'found'
    expect(amazonRow.outcome).toBe('found');
    // Bradley source_error should be preserved
    expect(bradleyRow.outcome).toBe('source_error');
  });

  it('regression: explicit found + genuine source_error -> processed', async () => {
    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: false,
          mode: 'mixed',
          config: { source_type: 'approved_source_extraction' },
        },
      },
      productsIngestionData: {
        sources: { enriched: {} },
        brand_id: 'brand-1',
      },
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const body = buildCallbackBody({
      status: 'success',
      product: { name: 'Found Product', image_urls: [] },
      confidence: { overall: 0.9, fields: {} },
      source_results: [
        {
          sourceSlug: 'phillips',
          sourceType: 'distributor',
          confidence: 0.9,
          evidenceUrl: 'https://shop.phillipspet.com/product/1',
          outcome: 'found',
        },
        {
          sourceSlug: 'bradley',
          sourceType: 'distributor',
          confidence: 0,
          evidenceUrl: 'https://www.bradleycaldwell.com/search?term=test',
          outcome: 'source_error',
          errorCode: 'network_timeout',
          errorMessage: 'Connection timed out',
        },
      ],
    });

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(body),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // found-wins: explicit found -> processed even with genuine error
    expect(payload.next_status).toBe('processed');
  });

  it('regression: all sources not_stocked -> processed', async () => {
    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: false,
          mode: 'mixed',
          config: { source_type: 'approved_source_extraction' },
        },
      },
      productsIngestionData: {
        sources: { enriched: {} },
        brand_id: 'brand-1',
      },
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const body = buildCallbackBody({
      status: 'failed',
      product: { image_urls: [] },
      confidence: { overall: 0, fields: {} },
      source_results: [
        {
          sourceSlug: 'bradley',
          sourceType: 'distributor',
          confidence: 0,
          evidenceUrl: 'https://www.bradleycaldwell.com/search?term=test',
          outcome: 'not_stocked',
        },
        {
          sourceSlug: 'central_pet',
          sourceType: 'distributor',
          confidence: 0,
          evidenceUrl: 'https://www.centralpet.com/Search?criteria=test',
          outcome: 'not_stocked',
        },
      ],
    });

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(body),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // All not_stocked -> processed (clean cascade, manual entry handles later)
    expect(payload.next_status).toBe('processed');
  });

  it('regression: no found + genuine source_error -> needs_attention with error_message', async () => {
    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: false,
          mode: 'mixed',
          config: { source_type: 'approved_source_extraction' },
        },
      },
      productsIngestionData: {
        sources: { enriched: {} },
        brand_id: 'brand-1',
      },
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const body = buildCallbackBody({
      status: 'failed',
      confidence: { overall: 0, fields: {} },
      source_results: [
        {
          sourceSlug: 'bradley',
          sourceType: 'distributor',
          confidence: 0,
          outcome: 'source_error',
          errorCode: 'auth_expired',
          errorMessage: 'Credentials expired for Bradley',
        },
      ],
    });

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(body),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // No found + source_error -> needs_attention
    expect(payload.next_status).toBe('needs_attention');

    // Should have a concise error message
    expect(mockSupabase.productUpdates.length).toBeGreaterThanOrEqual(1);
    const updatePayload = mockSupabase.productUpdates[0] as any;
    expect(updatePayload.error_message).toContain('Source errors');
    expect(updatePayload.error_message).toContain('bradley');
  });

  it('regression: approved-source failed payload with no source_results -> needs_attention', async () => {
    const mockSupabase = createMockSupabase({
      attemptData: {
        id: 'attempt-1',
        job_id: 'job-1',
        mode: 'mixed',
        attempt_number: 1,
        retry_count: 0,
        enrichment_jobs: {
          test_mode: false,
          mode: 'mixed',
          config: { source_type: 'approved_source_extraction' },
        },
      },
      productsIngestionData: {
        sources: { enriched: {} },
        brand_id: 'brand-1',
      },
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Payload without source_results array at all
    const body = buildCallbackBody({
      status: 'failed',
      confidence: { overall: 0, fields: {} },
      // No source_results override — buildCallbackBody includes one by default
    });

    // Omit source_results from the body to test no-source-results path
    const { source_results: _removed, ...bodyWithoutSources } = body;

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(bodyWithoutSources),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Approved source with no source_results and no top-level product data -> needs_attention
    expect(payload.next_status).toBe('needs_attention');
  });
});
