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
    attemptUpdates,
    retryInsertions,
    jobUpdates,
    productUpdates,
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

  it('uses the original requested mode when creating a retry attempt', async () => {
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
        { upc: 'UPC-1', attempt_number: 2, status: 'queued' },
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
    expect(mockSupabase.retryInsertions).toHaveLength(1);
    expect(mockSupabase.retryInsertions[0]).toMatchObject({
      job_id: 'job-1',
      upc: 'UPC-1',
      mode: 'distributor_only',
      attempt_number: 2,
    });
    expect(mockSupabase.attemptUpdates[0]).toMatchObject({
      result: expect.objectContaining({
        requested_extraction_mode: 'distributor_only',
      }),
      normalized_source: expect.objectContaining({
        requested_extraction_mode: 'distributor_only',
      }),
    });
  });

  it('does not retry terminal distributor_only failures', async () => {
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
    expect(payload.next_status).toBe('imported');
    expect(mockSupabase.retryInsertions).toHaveLength(0);
  });

  it('does not retry mixed approved-source failures with terminal extraction warnings', async () => {
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
    expect(payload.next_status).toBe('imported');
    expect(mockSupabase.retryInsertions).toHaveLength(0);
  });

  it('does not mark as processed if product name is missing even with success status', async () => {
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
    // It should be imported (terminal failure) or extracting (retry)
    expect(payload.next_status).toBe('imported');
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
});
