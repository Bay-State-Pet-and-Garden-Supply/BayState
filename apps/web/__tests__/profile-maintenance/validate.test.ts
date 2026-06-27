/**
 * Tests for POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate
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
const MOCK_VERSION_ID = '660e8400-e29b-41d4-a716-446655440001';

const { makeChain } = require('./helpers/mock-chain');

function makeMockVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_VERSION_ID,
    profile_id: MOCK_PROFILE_ID,
    version_number: 1,
    status: 'draft',
    rules: { profile_version: 'v1', fields: [] },
    compiled_crawl4ai_schema: { name: 'test', fields: [] },
    version_hash: 'abc123',
    ...overrides,
  };
}

describe('POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(401);
  });

  it('returns 404 for non-existent version', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const versionChain = makeChain({ data: null, error: { message: 'not found' } });
    versionChain.single = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: versionChain.single }) }) }) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/validate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 if version status is not draft/rejected', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const versionChain = makeChain({ data: makeMockVersion({ status: 'active' }), error: null });
    versionChain.single = jest.fn().mockResolvedValue({ data: makeMockVersion({ status: 'active' }), error: null });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: versionChain.single }) }) }) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/validate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('active');
  });

  it('returns 400 if version has no compiled_crawl4ai_schema', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const versionChain = makeChain({ data: makeMockVersion({ compiled_crawl4ai_schema: null }), error: null });
    versionChain.single = jest.fn().mockResolvedValue({ data: makeMockVersion({ compiled_crawl4ai_schema: null }), error: null });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: versionChain.single }) }) }) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/validate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('no compiled');
  });

  it('returns 400 if no validation set exists', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const versionChain = makeChain({ data: makeMockVersion(), error: null });
    versionChain.single = jest.fn().mockResolvedValue({ data: makeMockVersion(), error: null });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: versionChain.single }) }) }) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/validate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('No validation set');
  });

  it('returns 409 if in-flight validation run exists', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    const versionChain = makeChain({ data: makeMockVersion(), error: null });
    versionChain.single = jest.fn().mockResolvedValue({ data: makeMockVersion(), error: null });
    const setChain = makeChain({ data: { id: 'set-1' }, error: null });
    const runChain = makeChain({ data: { id: 'existing-run-1', status: 'running' }, error: null });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: versionChain.single }) }) }) };
        }
        if (table === 'profile_validation_sets') {
          return { select: jest.fn().mockReturnValue(setChain) };
        }
        if (table === 'profile_validation_runs') {
          return { select: jest.fn().mockReturnValue(runChain) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/validate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('already in progress');
  });

  it('returns 202 with job + validation_run on success', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });

    let capturedJobInsert: Record<string, unknown> | null = null;
    const setChain = makeChain({ data: { id: 'set-1' }, error: null });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          const chain = makeChain({ data: makeMockVersion(), error: null });
          chain.single = jest.fn().mockResolvedValue({ data: makeMockVersion(), error: null });
          return {
            select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: chain.single }) }) }),
            update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'profile_validation_sets') {
          return { select: jest.fn().mockReturnValue(setChain) };
        }
        if (table === 'profile_validation_runs') {
          return {
            select: jest.fn().mockReturnValue(makeChain({ data: null, error: null })),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'profile_validation_cases') {
          return {
            select: jest.fn().mockReturnValue(makeChain({ data: [
              { id: 'case-1', case_type: 'seed', target_url: 'https://example.com/pdp/1', expected_assertions: { page_type: 'product_detail_page' } },
            ], error: null })),
          };
        }
        if (table === 'profile_maintenance_jobs') {
          return {
            insert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
              capturedJobInsert = data;
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'job-1', kind: 'validate_profile_version', status: 'queued', created_at: '2026-06-25T12:00:00Z' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/validate`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.job).toBeDefined();
    expect(body.job.id).toBe('job-1');
    expect(body.job.kind).toBe('validate_profile_version');
    expect(body.profileVersionId).toBe(MOCK_VERSION_ID);
    expect(body.validationRunId).toBe('run-1');
    expect(body.caseCount).toBe(1);

    // Verify job payload includes validation cases + schema
    expect(capturedJobInsert).toBeDefined();
    const payload = capturedJobInsert!.payload as Record<string, unknown>;
    expect(payload.profile_version_id).toBe(MOCK_VERSION_ID);
    expect(payload.validation_run_id).toBe('run-1');
    expect(payload.validation_cases).toBeDefined();
    expect(Array.isArray(payload.validation_cases)).toBe(true);
    expect((payload.validation_cases as Array<unknown>).length).toBe(1);
    expect(payload.compiled_crawl4ai_schema).toBeDefined();
  });
});

export {};
