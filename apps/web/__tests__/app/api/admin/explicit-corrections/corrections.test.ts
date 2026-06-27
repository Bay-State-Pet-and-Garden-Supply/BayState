/**
 * Tests for GET and POST /api/admin/explicit-corrections
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

const { NextRequest, NextResponse } = require('next/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { createAdminClient } = require('@/lib/supabase/server');

const { makeChain } = require('@/__tests__/profile-maintenance/helpers/mock-chain');

function makeAuthMock(overrides: Record<string, unknown> = {}) {
  return {
    authorized: true,
    user: { id: 'user-1', email: 'admin@test.com' },
    role: 'admin' as const,
    ...overrides,
  };
}

const BASE_URL = 'http://localhost/api/admin/explicit-corrections';

// =============================================================================
// POST — Create correction
// =============================================================================

describe('POST /api/admin/explicit-corrections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue(makeAuthMock());
  });

  it('returns 401 without auth', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const { POST } = require('@/app/api/admin/explicit-corrections/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
          target_field: 'product_image',
          correction_type: 'accepted',
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const { POST } = require('@/app/api/admin/explicit-corrections/route');

    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('brand_id');
  });

  it('returns 400 for invalid correction_type', async () => {
    const { POST } = require('@/app/api/admin/explicit-corrections/route');

    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
          target_field: 'product_image',
          correction_type: 'invalid',
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('correction_type');
  });

  it('returns 201 with created correction on success', async () => {
    const mockCorrection = {
      id: 'corr-123',
      brand_id: 'brand-1',
      source_slug: 'test-brand',
      canonical_domain: 'example.com',
      target_field: 'product_image',
      correction_type: 'accepted',
      evidence_summary: { url: 'https://example.com/img.jpg' },
      created_by: 'user-1',
      created_at: '2026-06-26T00:00:00Z',
    };

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'explicit_extraction_corrections') {
          const insertChain = makeChain({ data: mockCorrection, error: null });
          insertChain.single = jest.fn().mockResolvedValue({ data: mockCorrection, error: null });
          return {
            insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: insertChain.single }) }),
          };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/explicit-corrections/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
          target_field: 'product_image',
          correction_type: 'accepted',
          evidence_summary: { url: 'https://example.com/img.jpg' },
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe('corr-123');
    expect(body.target_field).toBe('product_image');
  });

  it('stores created_by from auth user', async () => {
    let capturedInsertData: Record<string, unknown> | null = null;
    const insertSingle = jest.fn().mockResolvedValue({ data: { id: 'c1' }, error: null });
    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'explicit_extraction_corrections') {
          return {
            insert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
              capturedInsertData = data;
              return { select: jest.fn().mockReturnValue({ single: insertSingle }) };
            }),
          };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/explicit-corrections/route');
    await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
          target_field: 'product_image',
          correction_type: 'accepted',
        }),
      }),
    );

    expect(capturedInsertData).not.toBeNull();
    expect(capturedInsertData!.created_by).toBe('user-1');
  });
});

// =============================================================================
// GET — List corrections
// =============================================================================

describe('GET /api/admin/explicit-corrections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue(makeAuthMock());
  });

  it('returns 401 without auth', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const { GET } = require('@/app/api/admin/explicit-corrections/route');
    const response = await GET(
      new NextRequest(BASE_URL, { method: 'GET' }),
    );

    expect(response.status).toBe(401);
  });

  it('returns empty corrections array when no data', async () => {
    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'explicit_extraction_corrections') {
          return {
            select: jest.fn().mockReturnValue(makeChain({ data: [], count: 0, error: null })),
          };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/explicit-corrections/route');
    const response = await GET(
      new NextRequest(BASE_URL, { method: 'GET' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.corrections).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns all corrections ordered by created_at desc', async () => {
    const mockCorrections = [
      { id: 'c2', target_field: 'product_image', created_at: '2026-06-26T02:00:00Z' },
      { id: 'c1', target_field: 'product_name', created_at: '2026-06-26T01:00:00Z' },
    ];

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'explicit_extraction_corrections') {
          return {
            select: jest.fn().mockReturnValue(makeChain({ data: mockCorrections, count: 2, error: null })),
          };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/explicit-corrections/route');
    const response = await GET(
      new NextRequest(BASE_URL, { method: 'GET' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.corrections).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  // Helper to build a flexible corrections query chain that supports
  // .eq().order().range() and captures applied eq filters.
  function makeCorrectionsQueryChain(collectEq: (col: string, val: unknown) => void) {
    const promise = Promise.resolve({ data: [], count: 0, error: null });
    const chain: Record<string, any> = {};
    chain.eq = jest.fn().mockImplementation((col: string, val: unknown) => {
      collectEq(col, val);
      return chain;
    });
    chain.order = jest.fn().mockReturnValue(chain);
    chain.range = jest.fn().mockResolvedValue({ data: [], count: 0, error: null });
    chain.then = promise.then.bind(promise);
    chain.catch = promise.catch.bind(promise);
    return chain;
  }

  it('filters by correction_type query param', async () => {
    const appliedFilter: Record<string, unknown> = {};
    const chain = makeCorrectionsQueryChain((col, val) => { appliedFilter[col] = val; });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'explicit_extraction_corrections') {
          return { select: jest.fn().mockReturnValue(chain) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/explicit-corrections/route');
    await GET(
      new NextRequest(`${BASE_URL}?correction_type=accepted`, { method: 'GET' }),
    );

    expect(appliedFilter.correction_type).toBe('accepted');
  });

  it('filters by target_field query param', async () => {
    const appliedFilter: Record<string, unknown> = {};
    const chain = makeCorrectionsQueryChain((col, val) => { appliedFilter[col] = val; });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'explicit_extraction_corrections') {
          return { select: jest.fn().mockReturnValue(chain) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/explicit-corrections/route');
    await GET(
      new NextRequest(`${BASE_URL}?target_field=product_image`, { method: 'GET' }),
    );

    expect(appliedFilter.target_field).toBe('product_image');
  });

  it('filters by profile_id', async () => {
    const appliedFilter: Record<string, unknown> = {};
    const chain = makeCorrectionsQueryChain((col, val) => { appliedFilter[col] = val; });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'explicit_extraction_corrections') {
          return { select: jest.fn().mockReturnValue(chain) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/explicit-corrections/route');
    await GET(
      new NextRequest(`${BASE_URL}?profile_id=profile-123`, { method: 'GET' }),
    );

    expect(appliedFilter.profile_id).toBe('profile-123');
  });
});
