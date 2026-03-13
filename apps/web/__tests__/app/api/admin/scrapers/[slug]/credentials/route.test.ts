import { expect, it, describe, beforeEach, mock } from 'bun:test';
import { GET, POST, DELETE } from '@/app/api/admin/scrapers/[slug]/credentials/route';
import { createClient } from '@/lib/supabase/server';
import { getScraperCredentialStatuses, setScraperCredential, deleteScraperCredential } from '@/lib/admin/scrapers/credentials';

mock.module('next/server', () => ({
  NextRequest: class MockNextRequest {
    headers: Headers;
    url: string;
    bodyText: string;
    constructor(input: string | Request | URL, init?: any) {
      this.url = typeof input === 'string' ? input : 'http://localhost';
      this.headers = new Headers(init?.headers || {});
      this.bodyText = init?.body || '';
    }
    async json() {
      return JSON.parse(this.bodyText);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status || 200;
      return {
        status,
        json: async () => data,
      };
    },
  },
}));

mock.module('@/lib/supabase/server', () => ({
  createClient: mock(() => {}),
}));

mock.module('@/lib/admin/scrapers/credentials', () => ({
  getScraperCredentialStatuses: mock(() => Promise.resolve([])),
  setScraperCredential: mock(() => Promise.resolve()),
  deleteScraperCredential: mock(() => Promise.resolve()),
}));

describe('Scraper credentials API route', () => {
  const mockSupabase = {
    auth: {
      getUser: mock(() => {}),
    },
    from: mock(() => {}),
  };

  beforeEach(() => {
    (createClient as any).mockResolvedValue(mockSupabase);

    (mockSupabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const profileSelect = {
      eq: mock(() => ({
        single: mock(() => Promise.resolve({ data: { role: 'admin' } })),
      })),
    };

    (mockSupabase.from as any).mockReturnValue({
      select: mock(() => profileSelect),
    });
  });

  it('GET returns credential statuses', async () => {
    const mockStatuses = [{ type: 'login', configured: true, updated_at: '2026-03-13' }];
    (getScraperCredentialStatuses as any).mockResolvedValue(mockStatuses);

    const res = await GET({} as any, { params: Promise.resolve({ slug: 'amazon' }) });
    expect(res?.status).toBe(200);

    const body = await res!.json() as any;
    expect(body.statuses).toEqual(mockStatuses);
  });

  it('POST updates a credential', async () => {
    const body = { type: 'login', value: 'testuser' };
    const req = new (require('next/server').NextRequest)('http://localhost', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const res = await POST(req, { params: Promise.resolve({ slug: 'amazon' }) });
    expect(res?.status).toBe(200);
    expect(setScraperCredential).toHaveBeenCalledWith('amazon', 'login', 'testuser', 'user-1');
  });

  it('DELETE removes a credential', async () => {
    const req = new (require('next/server').NextRequest)('http://localhost?type=login');

    const res = await DELETE(req, { params: Promise.resolve({ slug: 'amazon' }) });
    expect(res?.status).toBe(200);
    expect(deleteScraperCredential).toHaveBeenCalledWith('amazon', 'login');
  });
});
