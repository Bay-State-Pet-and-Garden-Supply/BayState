/**
 * Tests for POST /api/admin/browser-profiles/[id]/revalidate
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

const { NextRequest } = require('next/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { createAdminClient } = require('@/lib/supabase/server');

function makeAuthMock(role: 'admin' | 'staff' = 'admin') {
  return {
    authorized: true,
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
  };
}

const MOCK_PROFILE_ID = 'bp-1';

function makeMockSupabase(overrides: Record<string, any> = {}) {
  const profileData = overrides.profileData ?? {
    id: MOCK_PROFILE_ID,
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    status: 'validated',
    storage_ref: '/home/runner/.crawl4ai/profiles/bp_test-brand',
    last_validated_at: new Date().toISOString(),
    environment: 'production',
  };
  const profileError = overrides.profileError ?? null;

  const inFlightRequest = overrides.inFlightRequest ?? null;

  const job = overrides.job ?? {
    id: 'job-rev-1',
    kind: 'browser_profile_revalidate',
    status: 'queued',
    created_at: new Date().toISOString(),
  };

  const setupRequest = overrides.setupRequest ?? {
    id: 'req-rev-1',
    browser_profile_id: MOCK_PROFILE_ID,
    request_type: 'revalidate',
    status: 'pending',
    maintenance_job_id: 'job-rev-1',
  };

  const profileSingle = jest.fn().mockResolvedValue({ data: profileData, error: profileError });
  const profileSelect = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: profileSingle }) });

  const inFlightLimit = jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: inFlightRequest, error: null }) });
  const inFlightNot = jest.fn().mockReturnValue({ limit: inFlightLimit });
  const inFlightStatusNot = jest.fn().mockReturnValue({ not: inFlightNot });
  const inFlightEq = jest.fn().mockReturnValue({ eq: inFlightStatusNot });
  const inFlightSelect = jest.fn().mockReturnValue({ eq: inFlightEq });

  const jobSingle = jest.fn().mockResolvedValue({ data: job, error: null });
  const jobSelect = jest.fn().mockReturnValue({ single: jobSingle });

  const setupSingle = jest.fn().mockResolvedValue({ data: setupRequest, error: null });
  const setupSelect = jest.fn().mockReturnValue({ single: setupSingle });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'browser_profiles') {
        return { select: profileSelect };
      }
      if (table === 'browser_profile_setup_requests') {
        return {
          select: inFlightSelect,
          insert: jest.fn().mockReturnValue({ select: setupSelect }),
        };
      }
      if (table === 'profile_maintenance_jobs') {
        return {
          insert: jest.fn().mockReturnValue({ select: jobSelect }),
        };
      }
      return { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
    }),
  };
}

describe('POST /api/admin/browser-profiles/[id]/revalidate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue(makeAuthMock('admin'));
  });

  it('returns 401 when auth fails', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: new (require('next/server').NextResponse)(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401 },
      ),
    });

    const { POST } = require('@/app/api/admin/browser-profiles/[id]/revalidate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/browser-profiles/${MOCK_PROFILE_ID}/revalidate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'x-api-key': 'test-key' },
      }),
      { params: Promise.resolve({ id: MOCK_PROFILE_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 for non-existent profile', async () => {
    const mockClient = makeMockSupabase({
      profileData: null,
      profileError: { message: 'not found' },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/[id]/revalidate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/browser-profiles/${MOCK_PROFILE_ID}/revalidate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'x-api-key': 'test-key' },
      }),
      { params: Promise.resolve({ id: MOCK_PROFILE_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 for revoked profile', async () => {
    const mockClient = makeMockSupabase({
      profileData: {
        id: MOCK_PROFILE_ID,
        brand_id: 'brand-1',
        source_slug: 'test-brand',
        canonical_domain: 'example.com',
        status: 'revoked',
        storage_ref: null,
        last_validated_at: null,
        environment: 'production',
      },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/[id]/revalidate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/browser-profiles/${MOCK_PROFILE_ID}/revalidate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'x-api-key': 'test-key' },
      }),
      { params: Promise.resolve({ id: MOCK_PROFILE_ID }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('cannot be revalidated');
  });

  it('returns 409 for in-flight revalidation', async () => {
    const mockClient = makeMockSupabase({
      inFlightRequest: { id: 'req-inflight', status: 'in_progress' },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/[id]/revalidate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/browser-profiles/${MOCK_PROFILE_ID}/revalidate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'x-api-key': 'test-key' },
      }),
      { params: Promise.resolve({ id: MOCK_PROFILE_ID }) },
    );
    expect(response.status).toBe(409);
  });

  it('returns 202 with browserProfile, setupRequest, and job for valid revalidate', async () => {
    const mockClient = makeMockSupabase({});
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/[id]/revalidate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/browser-profiles/${MOCK_PROFILE_ID}/revalidate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'x-api-key': 'test-key' },
      }),
      { params: Promise.resolve({ id: MOCK_PROFILE_ID }) },
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.browserProfile).toBeDefined();
    expect(body.browserProfile.id).toBe(MOCK_PROFILE_ID);
    expect(body.browserProfile.status).toBe('validated');
    expect(body.browserProfile.storage_ref).toBeDefined();
    expect(body.browserProfile.last_validated_at).toBeDefined();
    expect(body.setupRequest).toBeDefined();
    expect(body.setupRequest.request_type).toBe('revalidate');
    expect(body.job).toBeDefined();
    expect(body.job.kind).toBe('browser_profile_revalidate');
  });
});
