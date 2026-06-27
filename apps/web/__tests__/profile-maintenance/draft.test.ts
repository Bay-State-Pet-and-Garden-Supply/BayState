/**
 * Tests for POST /api/admin/site-extraction-profiles/[profileId]/draft
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

const MOCK_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeMockProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_PROFILE_ID,
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    source_type: 'official_brand',
    canonical_domain: 'example.com',
    status: 'draft',
    ...overrides,
  };
}

/**
 * Build a flexible PostgREST-like chain builder that is thenable.
 * Each chained method returns the chain itself (builder pattern).
 * `await chain` resolves with the terminal value.
 */
function makeChain(terminalValue: { data: any; error: any; count?: number }) {
  const promise = Promise.resolve(terminalValue);
  const chain: Record<string, jest.Mock | Function> = {};
  const methods = ['select', 'eq', 'not', 'in', 'order', 'limit', 'range', 'textSearch', 'single', 'maybeSingle'];
  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  // Make chain thenable so await supabase.from(...).select(...).eq(...) resolves
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);
  return chain as any;
}

describe('POST /api/admin/site-extraction-profiles/[profileId]/draft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/draft/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID }) },
    );

    expect(response.status).toBe(401);
  });

  it('returns 404 for non-existent profile', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profiles') {
          const chain = makeChain({ data: null, error: { message: 'not found' } });
          // Override single to return the error
          chain.single = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: chain.single }) }) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/draft/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID }) },
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 if profile status is not draft', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profiles') {
          const chain = makeChain({ data: makeMockProfile({ status: 'active' }), error: null });
          chain.single = jest.fn().mockResolvedValue({ data: makeMockProfile({ status: 'active' }), error: null });
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: chain.single }) }) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/draft/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('active');
  });

  it('returns 400 if no verified PDP seeds exist', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profiles') {
          const chain = makeChain({ data: makeMockProfile(), error: null });
          chain.single = jest.fn().mockResolvedValue({ data: makeMockProfile(), error: null });
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: chain.single }) }) };
        }
        if (table === 'product_detail_page_seeds') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: [], count: 0, error: null })) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/draft/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('verified PDP seeds');
  });

  it('returns 409 if non-terminal draft job exists', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const existingJob = { id: 'existing-job-1', kind: 'draft_site_extraction_profile', status: 'claimed', created_at: '2026-06-25T12:00:00Z' };

    let callCount = 0;
    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profiles') {
          const chain = makeChain({ data: makeMockProfile(), error: null });
          chain.single = jest.fn().mockResolvedValue({ data: makeMockProfile(), error: null });
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: chain.single }) }) };
        }
        if (table === 'product_detail_page_seeds') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: [{ id: 'seed-1', url: 'https://example.com/pdp/1' }], count: 1, error: null })) };
        }
        if (table === 'profile_maintenance_jobs') {
          return {
            select: jest.fn().mockImplementation(() => {
              callCount++;
              return callCount === 1
                ? makeChain({ data: existingJob, error: null })
                : makeChain({ data: null, error: null });
            }),
            insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn() }) }),
          };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/draft/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('already in progress');
  });

  it('returns 202 with job data on success', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profiles') {
          const chain = makeChain({ data: makeMockProfile(), error: null });
          chain.single = jest.fn().mockResolvedValue({ data: makeMockProfile(), error: null });
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: chain.single }) }) };
        }
        if (table === 'product_detail_page_seeds') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: [{ id: 'seed-1', url: 'https://example.com/pdp/1' }], count: 1, error: null })) };
        }
        if (table === 'profile_maintenance_jobs') {
          return {
            select: jest.fn().mockReturnValue(makeChain({ data: null, error: null })),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'job-1', kind: 'draft_site_extraction_profile', status: 'queued', created_at: '2026-06-25T12:00:00Z' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: null, error: null })) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/draft/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID }) },
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.job).toBeDefined();
    expect(body.job.id).toBe('job-1');
    expect(body.job.kind).toBe('draft_site_extraction_profile');
    expect(body.job.status).toBe('queued');
    expect(body.profileId).toBe(MOCK_PROFILE_ID);
    expect(body.verifiedSeedCount).toBe(1);
  });

  it('enqueues job with correct capabilities', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    let capturedInsert: Record<string, unknown> | null = null;

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profiles') {
          const chain = makeChain({ data: makeMockProfile(), error: null });
          chain.single = jest.fn().mockResolvedValue({ data: makeMockProfile(), error: null });
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: chain.single }) }) };
        }
        if (table === 'product_detail_page_seeds') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: [{ id: 'seed-1', url: 'https://example.com/pdp/1' }], count: 1, error: null })) };
        }
        if (table === 'profile_maintenance_jobs') {
          return {
            select: jest.fn().mockReturnValue(makeChain({ data: null, error: null })),
            insert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
              capturedInsert = data;
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'job-1', kind: 'draft_site_extraction_profile', status: 'queued', created_at: '2026-06-25T12:00:00Z' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: null, error: null })) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/draft/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID }) },
    );

    expect(response.status).toBe(202);
    expect(capturedInsert).toBeDefined();
    expect(capturedInsert!.kind).toBe('draft_site_extraction_profile');
    expect(capturedInsert!.required_capabilities).toEqual(
      expect.arrayContaining([
        'profile_maintenance',
        'profile_maintenance.draft_site_extraction_profile',
        'profile_maintenance.model_schema_draft',
        'profile_maintenance.crawl4ai',
      ]),
    );
    expect((capturedInsert!.payload as Record<string, unknown>).verified_seed_ids).toEqual(['seed-1']);
  });
});

export {};
