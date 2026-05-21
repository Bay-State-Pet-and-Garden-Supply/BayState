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
import { POST } from '@/app/api/scraper/v1/enrichment-callback/route';

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
  jobAttemptsData?: Array<{ sku: string; attempt_number: number; status: string }>;
}) {
  const attemptUpdates: unknown[] = [];
  const retryInsertions: unknown[] = [];
  const jobUpdates: unknown[] = [];

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
                { sku: 'SKU-1', attempt_number: 1, status: 'failed' },
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
      throw new Error('products_ingestion should not be accessed for test jobs');
    }

    throw new Error(`Unexpected table lookup: ${table}`);
  });

  return {
    from,
    attemptUpdates,
    retryInsertions,
    jobUpdates,
  };
}

function buildCallbackBody(overrides: Record<string, unknown> = {}) {
  return {
    _attempt_id: 'attempt-1',
    schema_version: 'v1',
    sku: 'SKU-1',
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
        { sku: 'SKU-1', attempt_number: 1, status: 'failed' },
        { sku: 'SKU-1', attempt_number: 2, status: 'queued' },
      ],
    });
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        body: JSON.stringify(buildCallbackBody()),
      } as any),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requested_extraction_mode).toBe('distributor_only');
    expect(mockSupabase.retryInsertions).toHaveLength(1);
    expect(mockSupabase.retryInsertions[0]).toMatchObject({
      job_id: 'job-1',
      sku: 'SKU-1',
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
        { sku: 'SKU-1', attempt_number: 1, status: 'failed' },
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
});
