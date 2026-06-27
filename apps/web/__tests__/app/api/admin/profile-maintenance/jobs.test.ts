/**
 * Tests for GET /api/admin/profile-maintenance/jobs/[id]
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

const MOCK_JOB_ID = 'job-1';

describe('GET /api/admin/profile-maintenance/jobs/[id]', () => {
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

    const { GET } = require('@/app/api/admin/profile-maintenance/jobs/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/profile-maintenance/jobs/${MOCK_JOB_ID}`),
      { params: Promise.resolve({ id: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when job not found', async () => {
    const mockClient = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
          }),
        }),
        // Don't call second time for artifacts
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/profile-maintenance/jobs/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/profile-maintenance/jobs/${MOCK_JOB_ID}`),
      { params: Promise.resolve({ id: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns 200 with job and artifact list', async () => {
    const jobData = {
      id: MOCK_JOB_ID,
      kind: 'verify_pdp_seed',
      status: 'succeeded',
      brand_id: 'brand-1',
      source_slug: 'test-brand',
      canonical_domain: 'example.com',
      payload: { url: 'https://example.com/pdp/1' },
      required_capabilities: ['profile_maintenance'],
      claimed_by: 'test-runner',
      lease_token: 'tok-1',
      attempt_count: 1,
      max_attempts: 3,
      result: { verification_status: 'verified' },
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const artifactsData = [
      { id: 'art-1', kind: 'verify_pdp_seed', status: 'created', schema_version: 'v1', created_at: new Date().toISOString() },
    ];

    // Chain for job select
    const jobSingle = jest.fn().mockResolvedValue({ data: jobData, error: null });
    const jobEq = jest.fn().mockReturnValue({ single: jobSingle });
    const jobSelect = jest.fn().mockReturnValue({ eq: jobEq });

    // Chain for artifacts select
    const artifactsOrder = jest.fn().mockResolvedValue({ data: artifactsData, error: null });
    const artifactsEq = jest.fn().mockReturnValue({ order: artifactsOrder });
    const artifactsSelect = jest.fn().mockReturnValue({ eq: artifactsEq });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'profile_maintenance_jobs') {
          return { select: jobSelect };
        }
        if (table === 'profile_maintenance_artifacts') {
          return { select: artifactsSelect };
        }
        return { select: jest.fn() };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/profile-maintenance/jobs/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/profile-maintenance/jobs/${MOCK_JOB_ID}`),
      { params: Promise.resolve({ id: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toBeDefined();
    expect(body.job.id).toBe(MOCK_JOB_ID);
    expect(body.job.kind).toBe('verify_pdp_seed');
    expect(body.artifacts).toBeDefined();
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0].id).toBe('art-1');
  });
});
