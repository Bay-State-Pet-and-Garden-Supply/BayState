/**
 * Tests for GET /api/admin/profile-maintenance/artifacts/[id]
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

function makeAuthMock() {
  return {
    authorized: true,
    user: { id: 'user-1', email: 'admin@test.com' },
    role: 'admin' as const,
  };
}

const MOCK_ARTIFACT_ID = 'art-1';

describe('GET /api/admin/profile-maintenance/artifacts/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue(makeAuthMock());
  });

  it('returns 401 when auth fails', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: new (require('next/server').NextResponse)(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401 },
      ),
    });

    const { GET } = require('@/app/api/admin/profile-maintenance/artifacts/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/profile-maintenance/artifacts/${MOCK_ARTIFACT_ID}`),
      { params: Promise.resolve({ id: MOCK_ARTIFACT_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when artifact not found', async () => {
    const singleFn = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    const eqFn = jest.fn().mockReturnValue({ single: singleFn });
    const selectFn = jest.fn().mockReturnValue({ eq: eqFn });

    const mockClient = {
      from: jest.fn().mockReturnValue({ select: selectFn }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/profile-maintenance/artifacts/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/profile-maintenance/artifacts/${MOCK_ARTIFACT_ID}`),
      { params: Promise.resolve({ id: MOCK_ARTIFACT_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns 200 with full artifact payload', async () => {
    const artifactData = {
      id: MOCK_ARTIFACT_ID,
      artifact_version: 'v1',
      kind: 'browser_profile_setup',
      job_id: 'job-1',
      attempt_number: 1,
      brand_id: 'brand-1',
      source_slug: 'test-brand',
      canonical_domain: 'example.com',
      browser_profile_id: 'bp-1',
      runner_name: 'test-runner',
      runner_environment: 'production',
      status: 'created',
      schema_version: '1',
      payload: {
        validation_status: 'validated',
        profile_name: 'bp_test-brand',
        profile_size_bytes: 1024,
        smoke_test_result: 'skipped',
      },
      evidence_refs: {},
      content_hash: null,
      content_size_bytes: null,
      content_type: null,
      review_status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      review_comment: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const singleFn = jest.fn().mockResolvedValue({ data: artifactData, error: null });
    const eqFn = jest.fn().mockReturnValue({ single: singleFn });
    const selectFn = jest.fn().mockReturnValue({ eq: eqFn });

    const mockClient = {
      from: jest.fn().mockReturnValue({ select: selectFn }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/profile-maintenance/artifacts/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/profile-maintenance/artifacts/${MOCK_ARTIFACT_ID}`),
      { params: Promise.resolve({ id: MOCK_ARTIFACT_ID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(MOCK_ARTIFACT_ID);
    expect(body.kind).toBe('browser_profile_setup');
    expect(body.payload).toBeDefined();
    expect(body.payload.validation_status).toBe('validated');
    expect(body.schema_version).toBe('1');
  });

  it('includes Cache-Control: no-cache header', async () => {
    const artifactData = {
      id: MOCK_ARTIFACT_ID,
      kind: 'browser_profile_revalidate',
      payload: {},
      schema_version: '1',
    };

    const singleFn = jest.fn().mockResolvedValue({ data: artifactData, error: null });
    const eqFn = jest.fn().mockReturnValue({ single: singleFn });
    const selectFn = jest.fn().mockReturnValue({ eq: eqFn });

    const mockClient = {
      from: jest.fn().mockReturnValue({ select: selectFn }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/profile-maintenance/artifacts/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/profile-maintenance/artifacts/${MOCK_ARTIFACT_ID}`),
      { params: Promise.resolve({ id: MOCK_ARTIFACT_ID }) },
    );
    expect(response.status).toBe(200);
    const cacheHeader = response.headers.get('Cache-Control');
    expect(cacheHeader).toBe('no-cache');
  });
});
