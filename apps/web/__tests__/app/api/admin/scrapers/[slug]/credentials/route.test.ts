import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { deleteScraperCredential, setScraperCredential } from '@/lib/admin/scrapers/credentials';

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

jest.mock('@/lib/admin/scrapers/credentials', () => ({
  getScraperCredentialStatuses: jest.fn(),
  setScraperCredential: jest.fn(),
  deleteScraperCredential: jest.fn(),
}));

describe('Scraper credentials API route', () => {
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

  it('GET returns credential statuses', async () => {
    const { GET } = await import('@/app/api/admin/scrapers/[slug]/credentials/route');
    const { getScraperCredentialStatuses } = jest.requireMock('@/lib/admin/scrapers/credentials') as { getScraperCredentialStatuses: { mockResolvedValue: (value: unknown) => void } };
    const mockStatuses = [{ type: 'login', configured: true, updated_at: '2026-03-13' }];
    getScraperCredentialStatuses.mockResolvedValue(mockStatuses);

    const res = await GET({} as never, { params: Promise.resolve({ slug: 'amazon' }) });
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);

    const body = await res!.json();
    expect(body.statuses).toEqual(mockStatuses);
  });

  it('POST updates a credential', async () => {
    const { POST } = await import('@/app/api/admin/scrapers/[slug]/credentials/route');
    const { setScraperCredential } = jest.requireMock('@/lib/admin/scrapers/credentials') as { setScraperCredential: jest.Mock };
    const req = {
      json: async () => ({ type: 'login', value: 'testuser' }),
    };

    const res = await POST(req as never, { params: Promise.resolve({ slug: 'amazon' }) });
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    expect(setScraperCredential).toHaveBeenCalledWith('amazon', 'login', 'testuser', 'user-1');
  });

  it('DELETE removes a credential', async () => {
    const { DELETE } = await import('@/app/api/admin/scrapers/[slug]/credentials/route');
    const { deleteScraperCredential } = jest.requireMock('@/lib/admin/scrapers/credentials') as { deleteScraperCredential: jest.Mock };
    const req = {
      url: 'http://localhost?type=login',
    };

    const res = await DELETE(req as never, { params: Promise.resolve({ slug: 'amazon' }) });
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    expect(deleteScraperCredential).toHaveBeenCalledWith('amazon', 'login');
  });
});
