/**
 * Tests for POST /api/admin/explicit-corrections/promote
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

function makeAuthMock() {
  return {
    authorized: true,
    user: { id: 'admin-1', email: 'admin@test.com' },
    role: 'admin' as const,
  };
}

const BASE_URL = 'http://localhost/api/admin/explicit-corrections/promote';

// =============================================================================
// Shared mocks
// =============================================================================

const MOCK_CORRECTIONS = [
  {
    id: 'corr-1',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    target_field: 'product_image',
    correction_type: 'accepted',
    evidence_summary: { url: 'https://example.com/good.jpg' },
    created_at: '2026-06-26T00:00:00Z',
  },
  {
    id: 'corr-2',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    target_field: 'product_image',
    correction_type: 'rejected',
    evidence_summary: { url: 'https://example.com/bad.jpg' },
    created_at: '2026-06-26T00:01:00Z',
  },
  {
    id: 'corr-3',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    target_field: 'product_name',
    correction_type: 'accepted',
    evidence_summary: { name: 'Good Product Name' },
    created_at: '2026-06-26T00:02:00Z',
  },
];

function buildPromoteClient(options?: {
  missingCorrections?: boolean;
  scopeMismatch?: boolean;
  existingProfile?: boolean;
  autoValidate?: boolean;
}) {
  const {
    missingCorrections = false,
    scopeMismatch = false,
    existingProfile = true,
    autoValidate = false,
  } = options ?? {};

  const corrections = scopeMismatch
    ? [
        ...MOCK_CORRECTIONS,
        {
          id: 'corr-mismatch',
          brand_id: 'brand-2',
          source_slug: 'other-brand',
          canonical_domain: 'other.com',
          target_field: 'product_image',
          correction_type: 'accepted',
          evidence_summary: {},
          created_at: '2026-06-26T00:03:00Z',
        },
      ]
    : MOCK_CORRECTIONS;

  const correctionData = missingCorrections ? [] : corrections;

  // Filter correctionData based on the requested IDs
  const correctionInFn = jest.fn().mockImplementation((_col: string, ids: string[]) => {
    const filtered = correctionData.filter((c: { id: string }) => ids.includes(c.id));
    const chain = makeChain({ data: filtered, error: null, count: filtered.length });
    return {
      ...chain,
      order: jest.fn().mockReturnValue(chain),
    };
  });

  // Profile select mock — supports chained .eq() calls
  const profileData = existingProfile
    ? { id: 'profile-123', status: 'draft' }
    : null;
  const profileMaybeSingle = jest.fn().mockResolvedValue({ data: profileData, error: null });
  const profileChain = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: profileMaybeSingle,
    then: Promise.resolve({ data: profileData, error: null }).then.bind(Promise.resolve({ data: profileData, error: null })),
    catch: Promise.resolve({ data: profileData, error: null }).catch.bind(Promise.resolve({ data: profileData, error: null })),
  };
  const profileSelect = jest.fn().mockReturnValue(profileChain);

  // Profile insert mock (for when profile doesn't exist)
  const profileInsertSingle = jest.fn().mockResolvedValue({
    data: { id: 'profile-new' },
    error: null,
  });
  const profileInsertSelect = jest.fn().mockReturnValue({ single: profileInsertSingle });
  const profileInsert = jest.fn().mockReturnValue({ select: profileInsertSelect });

  // Version select mock for latest version number
  const latestVersionMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  const latestVersionLimit = jest.fn().mockReturnValue({ maybeSingle: latestVersionMaybeSingle });
  const latestVersionOrder = jest.fn().mockReturnValue({ limit: latestVersionLimit });
  const latestVersionEq = jest.fn().mockReturnValue({ order: latestVersionOrder });
  const latestVersionSelect = jest.fn().mockReturnValue({ eq: latestVersionEq });

  // Version insert mock
  const versionInsertSingle = jest.fn().mockResolvedValue({
    data: {
      id: 'version-1',
      profile_id: existingProfile ? 'profile-123' : 'profile-new',
      version_number: 1,
      status: 'draft',
      version_hash: 'abc123def456abc123def456abc123de',
      created_from: 'explicit_correction',
      created_by: 'admin-1',
    },
    error: null,
  });
  const versionInsertSelect = jest.fn().mockReturnValue({ single: versionInsertSingle });
  const versionInsert = jest.fn().mockReturnValue({ select: versionInsertSelect });

  // Version update mock (for compiled_crawl4ai_schema)
  const versionUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const versionUpdate = jest.fn().mockReturnValue({ eq: versionUpdateEq });

  // Validation set mock
  const validationSetMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  const validationSetOrder = jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ maybeSingle: validationSetMaybeSingle }) });
  const validationSetSelect = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: validationSetOrder }) });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      switch (table) {
        case 'explicit_extraction_corrections':
          return {
            select: jest.fn().mockReturnValue({
              in: correctionInFn,
            }),
          };
        case 'site_extraction_profiles':
          return {
            select: profileSelect,
            insert: profileInsert,
          };
        case 'site_extraction_profile_versions':
          return {
            select: latestVersionSelect,
            insert: versionInsert,
            update: versionUpdate,
          };
        case 'profile_validation_sets':
          return {
            select: validationSetSelect,
          };
        case 'profile_validation_runs':
          return {
            select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })),
            insert: jest.fn().mockReturnValue(makeChain({ data: null, error: { message: 'no insert' } })),
          };
        case 'profile_maintenance_jobs':
          return {
            insert: jest.fn().mockReturnValue(makeChain({ data: null, error: { message: 'no insert' } })),
          };
        default:
          return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
      }
    }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('POST /api/admin/explicit-corrections/promote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue(makeAuthMock());
  });

  it('returns 401 without auth', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_ids: ['corr-1'] }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when correction_ids is missing or empty', async () => {
    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');

    const response1 = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(response1.status).toBe(400);

    const response2 = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_ids: [] }),
      }),
    );
    expect(response2.status).toBe(400);
  });

  it('returns 404 when corrections not found', async () => {
    (createAdminClient as jest.Mock).mockResolvedValue(buildPromoteClient({ missingCorrections: true }));

    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_ids: ['corr-nonexistent'] }),
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('No corrections found');
  });

  it('returns 400 when corrections have mismatched scope', async () => {
    (createAdminClient as jest.Mock).mockResolvedValue(buildPromoteClient({ scopeMismatch: true }));

    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_ids: ['corr-1', 'corr-2', 'corr-3', 'corr-mismatch'] }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('same brand_id');
  });

  it('creates draft version from corrections with existing profile', async () => {
    (createAdminClient as jest.Mock).mockResolvedValue(buildPromoteClient({ existingProfile: true }));

    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_ids: ['corr-1', 'corr-2', 'corr-3'] }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.version).toBeDefined();
    expect(body.version.created_from).toBe('explicit_correction');
    expect(body.profileId).toBe('profile-123');
    expect(body.correctionCount).toBe(3);
  });

  it('creates profile when none exists for scope', async () => {
    (createAdminClient as jest.Mock).mockResolvedValue(buildPromoteClient({ existingProfile: false }));

    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_ids: ['corr-1', 'corr-2'] }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.version).toBeDefined();
    expect(body.profileId).toBe('profile-new');
    expect(body.correctionCount).toBe(2);
  });

  it('includes validateJob when auto_validate=true and validation set exists', async () => {
    // Mock with an existing validation set
    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'explicit_extraction_corrections': {
            const inFn = jest.fn().mockImplementation((_col: string, ids: string[]) => {
              const filtered = MOCK_CORRECTIONS.filter((c: { id: string }) => ids.includes(c.id));
              const chain = makeChain({ data: filtered, error: null, count: filtered.length });
              return {
                ...chain,
                order: jest.fn().mockReturnValue(chain),
              };
            });
            return {
              select: jest.fn().mockReturnValue({ in: inFn }),
            };
          }
          case 'site_extraction_profiles': {
            const profileChain = makeChain({ data: { id: 'profile-123', status: 'draft' }, error: null });
            profileChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'profile-123', status: 'draft' }, error: null });
            return {
              select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue(profileChain) }),
              insert: jest.fn(),
            };
          }
          case 'site_extraction_profile_versions': {
            const verSelect = jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }) }),
              }),
            });
            const verInsertSingle = jest.fn().mockResolvedValue({
              data: { id: 'version-1', profile_id: 'profile-123', version_number: 1, status: 'draft', version_hash: 'abc', created_from: 'explicit_correction', created_by: 'admin-1' },
              error: null,
            });
            const verUpdateEq = jest.fn().mockResolvedValue({ error: null });
            return {
              select: verSelect,
              insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: verInsertSingle }) }),
              update: jest.fn().mockReturnValue({ eq: verUpdateEq }),
            };
          }
          case 'profile_validation_sets': {
            // Return an existing set
            const setChain = makeChain({ data: null, error: null });
            setChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'vs-1' }, error: null });
            return {
              select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ maybeSingle: setChain.maybeSingle }) }) }) }),
            };
          }
          case 'profile_validation_runs': {
            return {
              select: jest.fn().mockReturnValue(makeChain({ data: null, error: null })),
              insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'vr-1' }, error: null }) }) }),
            };
          }
          case 'profile_maintenance_jobs': {
            const jobSingle = jest.fn().mockResolvedValue({
              data: { id: 'job-1', kind: 'validate_profile_version', status: 'queued', created_at: '2026-06-26T00:00:00Z' },
              error: null,
            });
            return {
              insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jobSingle }) }),
            };
          }
          default:
            return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction_ids: ['corr-1', 'corr-2'],
          auto_validate: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.validateJob).toBeDefined();
    expect(body.validateJob.kind).toBe('validate_profile_version');
    expect(body.validateJob.status).toBe('queued');
  });

  it('does not include validateJob when auto_validate is false', async () => {
    (createAdminClient as jest.Mock).mockResolvedValue(buildPromoteClient({ existingProfile: true }));

    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction_ids: ['corr-1', 'corr-2'],
          auto_validate: false,
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.validateJob).toBeUndefined();
  });

  it('attaches a stub compiled_crawl4ai_schema to the version', async () => {
    let updateCall: Record<string, unknown> = {};
    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'explicit_extraction_corrections': {
            const chain = makeChain({ data: [MOCK_CORRECTIONS[0]], error: null });
            return {
              select: jest.fn().mockReturnValue({
                in: jest.fn().mockReturnValue({
                  ...chain,
                  order: jest.fn().mockReturnValue(chain),
                }),
              }),
            };
          }
          case 'site_extraction_profiles': {
            const profileChain = makeChain({ data: { id: 'profile-123', status: 'draft' }, error: null });
            profileChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'profile-123', status: 'draft' }, error: null });
            return {
              select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue(profileChain) }),
              insert: jest.fn(),
            };
          }
          case 'site_extraction_profile_versions': {
            const verSelect = jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }) }),
              }),
            });
            const verInsertSingle = jest.fn().mockResolvedValue({
              data: { id: 'version-1', profile_id: 'profile-123', version_number: 1, status: 'draft', version_hash: 'abc', created_from: 'explicit_correction', created_by: 'admin-1' },
              error: null,
            });
            const verUpdateEq = jest.fn().mockImplementation((col: string, val: unknown) => {
              updateCall = { col, val };
              return Promise.resolve({ error: null });
            });
            return {
              select: verSelect,
              insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: verInsertSingle }) }),
              update: jest.fn().mockReturnValue({ eq: verUpdateEq }),
            };
          }
          case 'profile_validation_sets':
            return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
          default:
            return { select: jest.fn().mockReturnValue(makeChain({ data: [], error: null })) };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/explicit-corrections/promote/route');
    const response = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_ids: ['corr-1'] }),
      }),
    );

    expect(response.status).toBe(201);
    expect(updateCall.col).toBeDefined();
    // The update set compiled_crawl4ai_schema on the version
    // The route calls .update({ compiled_crawl4ai_schema: stubSchema }).eq('id', versionId)
  });
});
