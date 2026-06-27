/**
 * Tests for POST /api/admin/browser-profiles/setup-requests
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
  requireAdminOnlyAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

const { NextRequest } = require('next/server');
const { requireAdminAuth, requireAdminOnlyAuth } = require('@/lib/admin/api-auth');
const { createAdminClient } = require('@/lib/supabase/server');

function makeAuthMock(role: 'admin' | 'staff' = 'admin') {
  return {
    authorized: true,
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
  };
}

function makeMockSupabase(overrides: Record<string, any> = {}) {
  const brandData = overrides.brandData ?? { id: 'brand-1', name: 'Test Brand', slug: 'test-brand' };
  const brandError = overrides.brandError ?? null;

  const existingProfile = overrides.existingProfile ?? null;
  const newProfile = overrides.newProfile ?? {
    id: 'bp-1',
    status: 'requested',
    required: false,
  };

  const inFlightRequest = overrides.inFlightRequest ?? null;

  const job = overrides.job ?? {
    id: 'job-1',
    kind: 'browser_profile_setup',
    status: 'queued',
    created_at: new Date().toISOString(),
  };

  const setupRequest = overrides.setupRequest ?? {
    id: 'req-1',
    browser_profile_id: 'bp-1',
    request_type: 'setup',
    status: 'pending',
    maintenance_job_id: 'job-1',
  };

  // Mock chain for single() results
  const brandSingle = jest.fn().mockResolvedValue({ data: brandData, error: brandError });
  const brandSelect = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: brandSingle }) });

  const existingProfileMaybeSingle = jest.fn().mockResolvedValue({ data: existingProfile, error: null });
  const existingProfileSelect = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: existingProfileMaybeSingle }) }) }) }) });

  const newProfileSingle = jest.fn().mockResolvedValue({ data: newProfile, error: null });
  const newProfileSelect = jest.fn().mockReturnValue({ single: newProfileSingle });

  const inFlightMaybeSingle = jest.fn().mockResolvedValue({ data: inFlightRequest, error: null });
  const inFlightSelect = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ not: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ maybeSingle: inFlightMaybeSingle }) }) }) }) });

  const jobSingle = jest.fn().mockResolvedValue({ data: job, error: null });
  const jobSelect = jest.fn().mockReturnValue({ single: jobSingle });

  const setupSingle = jest.fn().mockResolvedValue({ data: setupRequest, error: null });
  const setupSelect = jest.fn().mockReturnValue({ single: setupSingle });

  const updateFn = jest.fn().mockResolvedValue({ error: null });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'brands') {
        return { select: brandSelect };
      }
      if (table === 'browser_profiles') {
        return {
          select: existingProfileSelect,
          insert: jest.fn().mockReturnValue({ select: newProfileSelect }),
          update: jest.fn().mockReturnValue({ eq: updateFn }),
        };
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

describe('POST /api/admin/browser-profiles/setup-requests', () => {
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

    const { POST } = require('@/app/api/admin/browser-profiles/setup-requests/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/browser-profiles/setup-requests', {
        method: 'POST',
        body: JSON.stringify({ brand_id: 'brand-1', source_slug: 'test-brand', canonical_domain: 'example.com' }),
        headers: { 'x-api-key': 'test-key' },
      }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 when brand_id is missing', async () => {
    const { POST } = require('@/app/api/admin/browser-profiles/setup-requests/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/browser-profiles/setup-requests', {
        method: 'POST',
        body: JSON.stringify({ source_slug: 'test-brand', canonical_domain: 'example.com' }),
        headers: { 'x-api-key': 'test-key' },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('brand_id');
  });

  it('returns 404 when brand not found', async () => {
    const mockClient = makeMockSupabase({
      brandData: null,
      brandError: { message: 'not found' },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/setup-requests/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/browser-profiles/setup-requests', {
        method: 'POST',
        body: JSON.stringify({ brand_id: 'brand-nonexistent', source_slug: 'test-brand', canonical_domain: 'example.com' }),
        headers: { 'x-api-key': 'test-key' },
      }),
    );
    expect(response.status).toBe(404);
  });

  it('returns 202 with browserProfile, setupRequest, and job for valid request', async () => {
    const mockClient = makeMockSupabase({});
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/setup-requests/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/browser-profiles/setup-requests', {
        method: 'POST',
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
        }),
        headers: { 'x-api-key': 'test-key' },
      }),
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.browserProfile).toBeDefined();
    expect(body.browserProfile.brand_id).toBe('brand-1');
    expect(body.browserProfile.status).toBe('requested');
    expect(body.setupRequest).toBeDefined();
    expect(body.setupRequest.request_type).toBe('setup');
    expect(body.job).toBeDefined();
    expect(body.job.kind).toBe('browser_profile_setup');
  });

  it('returns 202 with required=false by default', async () => {
    const mockClient = makeMockSupabase({});
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/setup-requests/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/browser-profiles/setup-requests', {
        method: 'POST',
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
        }),
        headers: { 'x-api-key': 'test-key' },
      }),
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.browserProfile.required).toBe(false);
  });

  it('requires admin-only auth when required=true', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: new (require('next/server').NextResponse)(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403 },
      ),
    });

    const { POST } = require('@/app/api/admin/browser-profiles/setup-requests/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/browser-profiles/setup-requests', {
        method: 'POST',
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
          required: true,
        }),
        headers: { 'x-api-key': 'test-key' },
      }),
    );
    expect(response.status).toBe(403);
  });

  it('returns 409 when in-flight setup request exists', async () => {
    const mockClient = makeMockSupabase({
      inFlightRequest: { id: 'req-inflight', status: 'in_progress' },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/setup-requests/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/browser-profiles/setup-requests', {
        method: 'POST',
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
        }),
        headers: { 'x-api-key': 'test-key' },
      }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('in-flight');
  });

  it('upserts to existing browser profile when scope matches', async () => {
    const mockClient = makeMockSupabase({
      existingProfile: { id: 'bp-existing', status: 'validated', required: false },
      newProfile: null, // Should not be created
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/browser-profiles/setup-requests/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/browser-profiles/setup-requests', {
        method: 'POST',
        body: JSON.stringify({
          brand_id: 'brand-1',
          source_slug: 'test-brand',
          canonical_domain: 'example.com',
        }),
        headers: { 'x-api-key': 'test-key' },
      }),
    );
    expect(response.status).toBe(202);
  });
});
