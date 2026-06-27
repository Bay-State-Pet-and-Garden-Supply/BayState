/**
 * Tests for Brand Source Setup Admin API
 *
 * GET  /api/admin/brands/[id]/source-setup
 * PUT  /api/admin/brands/[id]/source-setup
 * POST /api/admin/brands/[id]/source-setup/pdp-seeds
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));
jest.mock('@/lib/approved-sources/source-cascade', () => ({
  isCascadeConfigured: jest.fn(),
}));

const { NextRequest } = require('next/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { createAdminClient } = require('@/lib/supabase/server');
const { isCascadeConfigured } = require('@/lib/approved-sources/source-cascade');

// =============================================================================
// Helpers
// =============================================================================

const MOCK_BRAND_ID = 'b0000000-0000-0000-0000-000000000001';

function makeMockBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_BRAND_ID,
    name: 'Test Brand',
    slug: 'test-brand',
    official_domains: [],
    preferred_domains: [],
    ...overrides,
  };
}

function makeMockProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p0000000-0000-0000-0000-000000000001',
    brand_id: MOCK_BRAND_ID,
    brand_source_id: 'bs0000000-0000-0000-0000-000000000001',
    source_slug: 'test-brand',
    source_type: 'official_brand',
    canonical_domain: 'example.com',
    status: 'draft',
    active_version_id: null,
    profile_setup_completed_at: null,
    metadata: {},
    created_at: '2026-06-25T12:00:00Z',
    updated_at: '2026-06-25T12:00:00Z',
    ...overrides,
  };
}

function makeMockSeed(overrides: Record<string, unknown> = {}) {
  return {
    id: 's0000000-0000-0000-0000-000000000001',
    brand_id: MOCK_BRAND_ID,
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    url: 'https://example.com/product/1',
    normalized_url: 'https://example.com/product/1',
    trust_status: 'candidate',
    verification_artifact_id: null,
    created_at: '2026-06-25T12:00:00Z',
    ...overrides,
  };
}

function makeMockJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'j0000000-0000-0000-0000-000000000001',
    kind: 'verify_pdp_seed',
    status: 'queued',
    brand_id: MOCK_BRAND_ID,
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    payload: {},
    required_capabilities: ['profile_maintenance', 'profile_maintenance.verify_pdp_seed', 'profile_maintenance.crawl4ai'],
    created_at: '2026-06-25T12:00:00Z',
    ...overrides,
  };
}

// =============================================================================
// Auth mock responses
// =============================================================================

function authSuccess(userId = 'admin-uuid') {
  return {
    authorized: true as const,
    user: { id: userId, email: 'admin@test.com' },
    role: 'admin' as const,
  };
}

function authFailure() {
  return {
    authorized: false as const,
    response: new (require('next/server').NextResponse)(
      { error: 'Unauthorized — valid admin API key or session required' },
      { status: 401 },
    ),
  };
}

// =============================================================================
// Tests: GET /api/admin/brands/[id]/source-setup
// =============================================================================

describe('GET /api/admin/brands/[id]/source-setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isCascadeConfigured as jest.Mock).mockResolvedValue(true);
  });

  it('returns 401 when auth fails', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authFailure());

    const { GET } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when brand not found', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'brands') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) }),
            }),
          };
        }
        return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: null }) }) }) }) };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns source setup summary for brand with no profile and no seeds', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());
    (isCascadeConfigured as jest.Mock).mockResolvedValue(false);

    const brand = makeMockBrand();

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      order: jest.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.brand.id).toBe(MOCK_BRAND_ID);
    expect(body.sourceSetup.hasOfficialDomain).toBe(false);
    expect(body.sourceSetup.siteExtractionProfile.id).toBeNull();
    expect(body.sourceSetup.pdpSeeds).toEqual([]);
    expect(body.sourceSetup.cascadeReadiness.configured).toBe(false);
  });

  it('returns source setup summary with existing profile and seeds', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());
    (isCascadeConfigured as jest.Mock).mockResolvedValue(true);

    const brand = makeMockBrand({ official_domains: ['example.com'] });
    const profile = makeMockProfile();
    const seed = makeMockSeed({ trust_status: 'verified', verification_artifact_id: 'artifact-1' });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      order: jest.fn().mockResolvedValue({ data: [seed], error: null }),
                    }),
                  }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { GET } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceSetup.hasOfficialDomain).toBe(true);
    expect(body.sourceSetup.siteExtractionProfile.id).toBe(profile.id);
    expect(body.sourceSetup.siteExtractionProfile.canonical_domain).toBe('example.com');
    expect(body.sourceSetup.siteExtractionProfile.status).toBe('draft');
    expect(body.sourceSetup.pdpSeeds).toHaveLength(1);
    expect(body.sourceSetup.pdpSeeds[0].trust_status).toBe('verified');
    expect(body.sourceSetup.pdpSeeds[0].verification_artifact_id).toBe('artifact-1');
    expect(body.sourceSetup.cascadeReadiness.configured).toBe(true);
  });
});

// =============================================================================
// Tests: PUT /api/admin/brands/[id]/source-setup
// =============================================================================

describe('PUT /api/admin/brands/[id]/source-setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isCascadeConfigured as jest.Mock).mockResolvedValue(true);
  });

  it('returns 401 when auth fails', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authFailure());

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: { official_domain: 'example.com' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 when official_domain is missing', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: {},
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('official_domain is required');
  });

  it('returns 400 when domain format is invalid', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: { official_domain: 'not-a-domain' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid domain format');
  });

  it('returns 404 when brand not found', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'brands') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) }),
            }),
            update: jest.fn(),
          };
        }
        return { select: jest.fn(), update: jest.fn(), upsert: jest.fn() };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: { official_domain: 'example.com' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('creates new site_extraction_profiles and brand_sources on first save', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const brandSourceResult = { id: 'bs-new-uuid' };
    let brandUpdated = false;

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
              update: jest.fn().mockImplementation(() => {
                brandUpdated = true;
                return { eq: jest.fn().mockResolvedValue({ error: null }) };
              }),
            };
          case 'brand_sources':
            return {
              upsert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: brandSourceResult, error: null }),
                }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
              upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          default:
            return { select: jest.fn(), update: jest.fn(), upsert: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    // Override isCascadeConfigured
    (isCascadeConfigured as jest.Mock).mockResolvedValue(true);

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: { official_domain: 'example.com' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(200);
    // Verify brand was updated
    expect(brandUpdated).toBe(true);
    // Verify brand_sources upsert was called
    const upsertCalls = mockClient.from.mock.calls.filter(c => c[0] === 'brand_sources');
    expect(upsertCalls.length).toBeGreaterThan(0);
    // Verify site_extraction_profiles upsert was called
    const profileUpsertCalls = mockClient.from.mock.calls.filter(c => c[0] === 'site_extraction_profiles');
    expect(profileUpsertCalls.length).toBeGreaterThan(0);
  });

  it('rejects disallowed marketplace domains', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: { official_domain: 'https://www.walmart.com/shop/' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('not allowed');
    expect(body.disallowedDomain).toBe('walmart.com');
  });

  it('rejects additional disallowed domains like petsmart and ebay', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: { official_domain: 'petsmart.com' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(400);
  });

  it('forces source_slug to brand.slug and source_type to official_brand', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const brandSourceResult = { id: 'bs-new-uuid' };
    let usedSourceSlug: string | undefined;
    let usedSourceType: string | undefined;

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
              update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
            };
          case 'brand_sources':
            return {
              upsert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
                usedSourceSlug = data.source_slug as string;
                usedSourceType = data.source_type as string;
                return {
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: brandSourceResult, error: null }),
                  }),
                };
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
              upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          default:
            return { select: jest.fn(), update: jest.fn(), upsert: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);
    (isCascadeConfigured as jest.Mock).mockResolvedValue(true);

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: {
          official_domain: 'example.com',
          source_slug: 'malicious-slug',
          source_type: 'scraper_managed',
        },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(200);
    // Must use brand.slug and 'official_brand', ignoring request body values
    expect(usedSourceSlug).toBe('test-brand');
    expect(usedSourceType).toBe('official_brand');
  });

  it('normalizes domain correctly (strips protocol, www, path, and trailing slash)', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
              update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
            };
          case 'brand_sources':
            return {
              upsert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: { id: 'bs-new-uuid' }, error: null }),
                }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
              upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          default:
            return { select: jest.fn(), update: jest.fn(), upsert: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { PUT } = require('@/app/api/admin/brands/[id]/source-setup/route');
    const response = await PUT(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup`, {
        method: 'PUT',
        body: { official_domain: 'https://Example.COM/path/' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(200);
    // Check that the site_extraction_profiles upsert used the normalized domain
    const profileUpsertArgs = mockClient.from.mock.calls.find(c => c[0] === 'site_extraction_profiles');
    expect(profileUpsertArgs).toBeTruthy();
  });
});

// =============================================================================
// Tests: POST /api/admin/brands/[id]/source-setup/pdp-seeds
// =============================================================================

describe('POST /api/admin/brands/[id]/source-setup/pdp-seeds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when auth fails', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authFailure());

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 when URL is missing', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: {},
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('url is required');
  });

  it('returns 400 when brand not found', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'brands') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) }),
            }),
          };
        }
        return { select: jest.fn() };
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 when no source setup exists', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('source setup not configured');
  });

  it('returns 400 when URL domain does not match canonical domain', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const profile = makeMockProfile({ canonical_domain: 'example.com' });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://other-domain.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('does not match');
  });

  it('creates seed and enqueues job on success', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const profile = makeMockProfile({ canonical_domain: 'example.com' });
    const newSeed = makeMockSeed();
    const newJob = makeMockJob();

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      eq: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: newSeed, error: null }),
                }),
              }),
            };
          case 'profile_maintenance_jobs':
            return {
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: newJob, error: null }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.pdpSeed.trust_status).toBe('candidate');
    expect(body.verificationJob.kind).toBe('verify_pdp_seed');
    expect(body.verificationJob.status).toBe('queued');
  });

  it('returns 409 when seed already exists and is verified', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const profile = makeMockProfile({ canonical_domain: 'example.com' });
    const existingSeed = makeMockSeed({
      trust_status: 'verified',
      verification_artifact_id: 'artifact-1',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              // Insert fails with unique violation (race)
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
                }),
              }),
              // Then fetch returns the existing verified seed
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      eq: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: existingSeed }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('already exists and is verified');
    expect(body.existing).toBeDefined();
  });

  it('reuses existing seed on race (unique violation) and enqueues verification job', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const profile = makeMockProfile({ canonical_domain: 'example.com' });
    const existingSeed = makeMockSeed({ trust_status: 'candidate' });
    const newJob = makeMockJob();

    let seedInsertCalled = false;
    let seedFetchCalled = false;
    let jobCheckCalled = false;

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              // Insert fails with unique violation (race with concurrent request)
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
                }),
              }),
              // Then fetch returns existing non-verified seed
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      eq: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: existingSeed }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'profile_maintenance_jobs':
            return {
              // Check for existing non-terminal job — returns none
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    not: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
              // Enqueue new verification job
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: newJob, error: null }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    // Track calls on the mock client
    const originalFrom = mockClient.from;
    mockClient.from = jest.fn().mockImplementation((table: string) => {
      const result = originalFrom(table);
      if (table === 'product_detail_page_seeds') {
        seedInsertCalled = true;
        seedFetchCalled = true;
      }
      if (table === 'profile_maintenance_jobs') {
        jobCheckCalled = true;
      }
      return result;
    });

    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pdpSeed.id).toBe(existingSeed.id);
    // Should have enqueued (or returned existing) verification job
    expect(body.verificationJob).not.toBeNull();
    expect(body.verificationJob.id).toBe(newJob.id);
  });

  it('returns existing verified seed as 409 even on race (unique violation with verified seed)', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const profile = makeMockProfile({ canonical_domain: 'example.com' });
    const existingSeed = makeMockSeed({
      trust_status: 'verified',
      verification_artifact_id: 'artifact-1',
    });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
                }),
              }),
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      eq: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: existingSeed }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('already exists and is verified');
  });

  it('normalizes URLs correctly', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const profile = makeMockProfile({ canonical_domain: 'example.com' });

    // Track what normalized_url gets passed
    let insertedNormalizedUrl: string | undefined;

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      eq: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              insert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
                insertedNormalizedUrl = data.normalized_url as string;
                return {
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                      data: { id: 'new-seed', url: data.url, normalized_url: data.normalized_url, trust_status: 'candidate', created_at: 'now' },
                      error: null,
                    }),
                  }),
                };
              }),
            };
          case 'profile_maintenance_jobs':
            return {
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: makeMockJob(), error: null }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://Example.COM/product/123#fragment' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(insertedNormalizedUrl).toBe('https://example.com/product/123');
  });

  it('sets created_by to auth user id', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess('admin-user-id'));

    const brand = makeMockBrand();
    const profile = makeMockProfile({ canonical_domain: 'example.com' });

    let insertedCreatedBy: string | undefined;

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      eq: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              insert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
                insertedCreatedBy = data.created_by as string;
                return {
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                      data: { id: 'new-seed', url: data.url, normalized_url: data.normalized_url, trust_status: 'candidate', created_at: 'now' },
                      error: null,
                    }),
                  }),
                };
              }),
            };
          case 'profile_maintenance_jobs':
            return {
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: makeMockJob(), error: null }),
                }),
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(insertedCreatedBy).toBe('admin-user-id');
  });

  it('requires required_capabilities on the job', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue(authSuccess());

    const brand = makeMockBrand();
    const profile = makeMockProfile({ canonical_domain: 'example.com' });

    let jobCapabilities: string[] | undefined;

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        switch (table) {
          case 'brands':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: brand, error: null }) }),
              }),
            };
          case 'site_extraction_profiles':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        maybeSingle: jest.fn().mockResolvedValue({ data: profile }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'product_detail_page_seeds':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      eq: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: makeMockSeed(),
                    error: null,
                  }),
                }),
              }),
            };
          case 'profile_maintenance_jobs':
            return {
              insert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
                jobCapabilities = data.required_capabilities as string[];
                return {
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                      data: makeMockJob(),
                      error: null,
                    }),
                  }),
                };
              }),
            };
          default:
            return { select: jest.fn() };
        }
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/admin/brands/[id]/source-setup/pdp-seeds/route');
    await POST(
      new NextRequest(`http://localhost/api/admin/brands/${MOCK_BRAND_ID}/source-setup/pdp-seeds`, {
        method: 'POST',
        body: { url: 'https://example.com/product/1' },
      }),
      { params: Promise.resolve({ id: MOCK_BRAND_ID }) },
    );

    expect(jobCapabilities).toContain('profile_maintenance');
    expect(jobCapabilities).toContain('profile_maintenance.verify_pdp_seed');
    expect(jobCapabilities).toContain('profile_maintenance.crawl4ai');
  });
});

export {};
