/**
 * Tests for POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminOnlyAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

const { NextRequest, NextResponse } = require('next/server');
const { requireAdminOnlyAuth } = require('@/lib/admin/api-auth');
const { createAdminClient } = require('@/lib/supabase/server');

const MOCK_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_VERSION_ID = '660e8400-e29b-41d4-a716-446655440001';
const MOCK_USER_ID = 'admin-user-1';

const { makeChain } = require('./helpers/mock-chain');

function makeMockVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_VERSION_ID,
    profile_id: MOCK_PROFILE_ID,
    version_number: 1,
    status: 'draft',
    compiled_crawl4ai_schema: { name: 'test', fields: [] },
    ...overrides,
  };
}

describe('POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'All tests pass. Ready to activate.' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(401);
  });

  it('returns 403 for staff (non-admin)', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 }),
    });

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'All tests pass. Ready to activate.' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 for non-existent version', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: MOCK_USER_ID },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: null, error: { message: 'not found' } })) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
      rpc: jest.fn(),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'All tests pass. Ready to activate.' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 if version status is not draft/validating', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: MOCK_USER_ID },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: makeMockVersion({ status: 'active' }), error: null })) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
      rpc: jest.fn(),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'All tests pass. Ready to activate.' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('active');
  });

  it('returns 400 if no compiled_crawl4ai_schema', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: MOCK_USER_ID },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: makeMockVersion({ compiled_crawl4ai_schema: null }), error: null })) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
      rpc: jest.fn(),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'All tests pass. Ready to activate.' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('no compiled');
  });

  it('returns 400 if no validation runs exist', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: MOCK_USER_ID },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: makeMockVersion(), error: null })) };
        }
        if (table === 'profile_validation_runs') {
          // Return null so the 'no validation runs' check triggers
          return { select: jest.fn().mockReturnValue(makeChain({ data: null, error: null })) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'All tests pass. Ready to activate.' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('most recent validation run');
  });

  it('returns 400 if latest validation run did not pass', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: MOCK_USER_ID },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: makeMockVersion(), error: null })) };
        }
        if (table === 'profile_validation_runs') {
          // Return a run that exists but did not pass
          return { select: jest.fn().mockReturnValue(makeChain({ data: { id: 'run-1', status: 'failed' }, error: null })) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'All tests pass. Ready to activate.' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('most recent validation run');
  });

  it('returns 400 if approval_note is too short', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: MOCK_USER_ID },
      role: 'admin',
    });

    const mockClient = {
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) }),
      rpc: jest.fn(),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'Short' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('at least 10');
  });

  it('returns 200 with activated version on success', async () => {
    (requireAdminOnlyAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: MOCK_USER_ID },
      role: 'admin',
    });

    // Use makeChain for all tables - each .select() returns a fresh thenable chain
    const versionSelect = jest.fn().mockReturnValue(makeChain({ data: makeMockVersion(), error: null }));
    const updatedVersionSelect = jest.fn().mockReturnValue(makeChain({
      data: {
        id: MOCK_VERSION_ID, profile_id: MOCK_PROFILE_ID, version_number: 1, status: 'active',
        approved_by: MOCK_USER_ID, approved_at: '2026-06-25T12:00:00Z',
        approval_note: 'All validation cases pass. Ready to activate.',
      }, error: null,
    }));
    const profileSelect = jest.fn().mockReturnValue(makeChain({
      data: { id: MOCK_PROFILE_ID, status: 'active', active_version_id: MOCK_VERSION_ID }, error: null,
    }));
    const rpcMock = jest.fn().mockResolvedValue({
      data: { profile_id: MOCK_PROFILE_ID, version_id: MOCK_VERSION_ID, status: 'active' }, error: null,
    });

    let versionSelectCount = 0;
    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return {
            select: jest.fn().mockImplementation(() => {
              versionSelectCount++;
              return versionSelectCount === 1 ? versionSelect() : updatedVersionSelect();
            }),
          };
        }
        if (table === 'profile_validation_runs') {
          return { select: jest.fn().mockReturnValue(makeChain({ data: { id: 'run-1', status: 'passed' }, error: null })) };
        }
        if (table === 'site_extraction_profiles') {
          return { select: jest.fn().mockReturnValue(profileSelect()) };
        }
        return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }),
      rpc: rpcMock,
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/site-extraction-profiles/${MOCK_PROFILE_ID}/versions/${MOCK_VERSION_ID}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_note: 'All validation cases pass. Ready to activate.' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ profileId: MOCK_PROFILE_ID, versionId: MOCK_VERSION_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.activationResult).toBeDefined();
    expect(body.activationResult.status).toBe('active');
    expect(body.profileVersion).toBeDefined();
    expect(body.profile).toBeDefined();

    expect(rpcMock).toHaveBeenCalledWith('activate_profile_version', {
      p_version_id: MOCK_VERSION_ID, p_approved_by: MOCK_USER_ID,
      p_approval_note: 'All validation cases pass. Ready to activate.',
    });
  });


});

export {};
