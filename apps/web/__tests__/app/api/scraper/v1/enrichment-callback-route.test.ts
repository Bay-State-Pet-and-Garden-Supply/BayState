/**
 * Tests for POST /api/scraper/v1/enrichment-callback
 *
 * The runner sends the EnrichmentResultV1 payload here after completing
 * extraction. Tests cover: auth, parsing, lease verification, found-wins
 * status, all-error needs_attention, source-attempt writing.
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/scraper-auth', () => ({
  validateRunnerAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));
jest.mock('@/lib/scraper-callback/products-ingestion', () => ({
  persistProductsIngestionSourcesPartial: jest.fn(),
}));

const { NextRequest } = require('next/server');
const { validateRunnerAuth } = require('@/lib/scraper-auth');
const { createAdminClient } = require('@/lib/supabase/server');
const { persistProductsIngestionSourcesPartial } = require('@/lib/scraper-callback/products-ingestion');
const { POST } = require('@/app/api/scraper/v1/enrichment-callback/route');

function makeMockSupabase(options: {
  attemptResult?: any;
  productResult?: any;
  expectSourceDeletes?: boolean;
  expectSourceInserts?: boolean;
}) {
  const {
    attemptResult = null,
    productResult = null,
    expectSourceDeletes = false,
    expectSourceInserts = false,
  } = options;

  const updateFn = jest.fn().mockReturnThis();
  const eqFn = jest.fn().mockReturnThis();
  const singleFn = jest.fn().mockResolvedValue(
    attemptResult ?? { data: null, error: { message: 'not found' } },
  );
  const inFn = jest.fn().mockReturnThis();
  const isFn = jest.fn().mockReturnThis();
  const deleteFn = jest.fn().mockReturnThis();

  const mockClient = {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: singleFn,
          in: inFn,
        }),
        in: inFn,
      }),
      update: updateFn,
      insert: jest.fn().mockResolvedValue({ error: null }),
      delete: deleteFn,
      eq: eqFn,
      is: isFn,
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };

  return { mockClient, singleFn, updateFn, eqFn, inFn, deleteFn };
}

describe('POST /api/scraper/v1/enrichment-callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });
    (persistProductsIngestionSourcesPartial as jest.Mock).mockResolvedValue({
      persisted: ['072705115310'],
      missing: [],
    });
  });

  it('returns 401 when auth fails', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_invalid' },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 when payload is invalid', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 404 when attempt not found', async () => {
    const { mockClient } = makeMockSupabase({
      attemptResult: { data: null, error: { message: 'not found' } },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const payload = {
      _attempt_id: '550e8400-e29b-41d4-a716-446655440000',
      upc: '072705115310',
      source: { url: 'https://phillips.com/product' },
      status: 'success',
      extracted_at: '2026-06-14T12:00:00Z',
      source_results: [{ sourceSlug: 'phillips', sourceType: 'distributor', outcome: 'found' }],
    };

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(404);
  });

  it('returns 409 on lease mismatch', async () => {
    const { mockClient } = makeMockSupabase({
      attemptResult: {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'running',
          lease_token: 'correct-lease-token',
          job_id: '660e8400-e29b-41d4-a716-446655440001',
          upc: '072705115310',
        },
        error: null,
      },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const payload = {
      _attempt_id: '550e8400-e29b-41d4-a716-446655440000',
      _lease_token: 'wrong-lease-token',
      upc: '072705115310',
      source: { url: 'https://phillips.com/product' },
      status: 'success',
      extracted_at: '2026-06-14T12:00:00Z',
    };

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(409);
  });

  it('processes a successful callback and returns processed status', async () => {
    const { mockClient } = makeMockSupabase({
      attemptResult: {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'running',
          lease_token: 'correct-lease',
          job_id: '660e8400-e29b-41d4-a716-446655440001',
          upc: '072705115310',
        },
        error: null,
      },
      productResult: {
        data: { brand_id: 'brand-1' },
        error: null,
      },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const payload = {
      _attempt_id: '550e8400-e29b-41d4-a716-446655440000',
      _lease_token: 'correct-lease',
      upc: '072705115310',
      source: { url: 'https://phillips.com/product' },
      status: 'success',
      extracted_at: '2026-06-14T12:00:00Z',
      product: { name: 'Test Product', brand_name: 'Test Brand', description: 'A test' },
      confidence: { overall: 0.95, fields: { name: 0.9 } },
      source_results: [
        {
          sourceSlug: 'phillips',
          sourceType: 'distributor',
          confidence: 0.85,
          outcome: 'found',
          product: { name: 'Test Product', description: 'A test' },
          matchedFields: ['name', 'description'],
        },
        {
          sourceSlug: 'orgill',
          sourceType: 'distributor',
          confidence: 0.0,
          outcome: 'not_stocked',
          matchedFields: [],
        },
      ],
    };

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.pipeline_status).toBe('processed'); // Found-wins — phillips found it
    expect(body.source_count).toBe(2);
  });

  it('sets needs_attention when all sources error', async () => {
    const { mockClient } = makeMockSupabase({
      attemptResult: {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'running',
          lease_token: 'correct-lease',
          job_id: '660e8400-e29b-41d4-a716-446655440001',
          upc: '072705115310',
        },
        error: null,
      },
      productResult: {
        data: { brand_id: 'brand-1' },
        error: null,
      },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const payload = {
      _attempt_id: '550e8400-e29b-41d4-a716-446655440000',
      _lease_token: 'correct-lease',
      upc: '072705115310',
      source: { url: 'https://phillips.com/product' },
      status: 'failed',
      extracted_at: '2026-06-14T12:00:00Z',
      product: {},
      confidence: { overall: 0.0, fields: {} },
      source_results: [
        {
          sourceSlug: 'phillips',
          sourceType: 'distributor',
          confidence: 0,
          outcome: 'source_error',
          error_message: 'Auth expired',
          error_code: 'auth_expired',
          matchedFields: [],
        },
        {
          sourceSlug: 'orgill',
          sourceType: 'distributor',
          confidence: 0,
          outcome: 'source_error',
          error_message: 'Network timeout',
          matchedFields: [],
        },
      ],
    };

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pipeline_status).toBe('needs_attention');
  });

  it('skips already-completed attempts', async () => {
    const { mockClient } = makeMockSupabase({
      attemptResult: {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'success', // Already completed
          lease_token: 'correct-lease',
          job_id: '660e8400-e29b-41d4-a716-446655440001',
          upc: '072705115310',
        },
        error: null,
      },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const payload = {
      _attempt_id: '550e8400-e29b-41d4-a716-446655440000',
      upc: '072705115310',
      source: { url: 'https://phillips.com/product' },
      status: 'success',
      extracted_at: '2026-06-14T12:00:00Z',
    };

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/enrichment-callback', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('already_completed');
  });
});

export {};
