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
  getLocalScraperConfig: jest.fn(),
}));

describe('Specific scraper config API route', () => {
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

  it('returns YAML content for a valid slug', async () => {
    const { GET } = await import('@/app/api/admin/scrapers/configs/[slug]/route');
    const { getLocalScraperConfig } = jest.requireMock('@/lib/admin/scrapers/configs') as { getLocalScraperConfig: { mockResolvedValue: (value: unknown) => void } };
    const yamlContent = 'name: amazon\ndisplay_name: Amazon\nbase_url: https://www.amazon.com';
    getLocalScraperConfig.mockResolvedValue({
      yaml: yamlContent,
      config: { name: 'amazon' },
    });

    const res = await GET({} as never, { params: Promise.resolve({ slug: 'amazon' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.yaml).toBe(yamlContent);
    expect(body.config.name).toBe('amazon');
  });

  it('returns 404 if config does not exist', async () => {
    const { GET } = await import('@/app/api/admin/scrapers/configs/[slug]/route');
    const { getLocalScraperConfig } = jest.requireMock('@/lib/admin/scrapers/configs') as { getLocalScraperConfig: { mockResolvedValue: (value: unknown) => void } };
    getLocalScraperConfig.mockResolvedValue(null);

    const res = await GET({} as never, { params: Promise.resolve({ slug: 'non-existent' }) });
    expect(res.status).toBe(404);
  });

  it('returns 401 if not authenticated', async () => {
    const { GET } = await import('@/app/api/admin/scrapers/configs/[slug]/route');
    (mockSupabase.auth.getUser as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await GET({} as never, { params: Promise.resolve({ slug: 'amazon' }) });
    expect(res.status).toBe(401);
  });
});
