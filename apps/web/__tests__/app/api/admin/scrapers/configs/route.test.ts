import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/admin/scrapers/configs', () => ({
  getLocalScraperConfigs: jest.fn(),
}));

describe('Scraper configs API route', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { createClient } = jest.requireMock('@/lib/supabase/server') as { createClient: { mockResolvedValue: (value: unknown) => void } };
    createClient.mockResolvedValue(mockSupabase);

    (mockSupabase.auth.getUser as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const profileSelect = {
      eq: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: { role: 'admin' } })),
      })),
    };

    mockSupabase.from.mockReturnValue({
      select: jest.fn(() => profileSelect),
    });
  });

  it('returns list of scraper configs', async () => {
    const { GET } = await import('@/app/api/admin/scrapers/configs/route');
    const { getLocalScraperConfigs } = jest.requireMock('@/lib/admin/scrapers/configs') as { getLocalScraperConfigs: { mockResolvedValue: (value: unknown) => void } };
    getLocalScraperConfigs.mockResolvedValue([
      { name: 'amazon', display_name: 'Amazon', base_url: 'https://www.amazon.com', schema_version: '1.0' },
      { name: 'chewy', display_name: 'Chewy', base_url: 'https://www.chewy.com', schema_version: '1.0' },
    ]);

    const res = await GET({} as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.configs).toHaveLength(2);
    expect(body.configs[0]).toMatchObject({
      name: 'amazon',
      display_name: 'Amazon',
      base_url: 'https://www.amazon.com',
    });
  });

  it('returns 401 if not authenticated', async () => {
    const { GET } = await import('@/app/api/admin/scrapers/configs/route');
    (mockSupabase.auth.getUser as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await GET({} as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 if not admin', async () => {
    const { GET } = await import('@/app/api/admin/scrapers/configs/route');
    const profileSelect = {
      eq: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: { role: 'user' } })),
      })),
    };

    mockSupabase.from.mockReturnValue({
      select: jest.fn(() => profileSelect),
    });

    const res = await GET({} as never);
    expect(res.status).toBe(403);
  });
});
