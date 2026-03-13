import { expect, it, describe, beforeEach, mock } from 'bun:test';
import { GET } from '@/app/api/admin/scrapers/configs/route';
import { createClient } from '@/lib/supabase/server';
import fs from 'fs';

mock.module('next/server', () => ({
  NextRequest: class MockNextRequest {
    headers: Headers;
    url: string;
    constructor(input: string | Request | URL, init?: RequestInit) {
      this.url = typeof input === 'string' ? input : 'http://localhost';
      this.headers = new Headers(init?.headers || {});
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

mock.module('fs', () => ({
  readdirSync: mock(() => []),
  readFileSync: mock(() => ''),
  existsSync: mock(() => true),
  default: {
    readdirSync: mock(() => []),
    readFileSync: mock(() => ''),
    existsSync: mock(() => true),
  }
}));

describe('Scraper configs API route', () => {
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

  it('returns list of scraper configs from YAML files', async () => {
    (fs.readdirSync as any).mockReturnValue(['amazon.yaml', 'chewy.yaml']);
    (fs.readFileSync as any).mockImplementation((filePath: string) => {
      if (filePath.endsWith('amazon.yaml')) {
        return 'name: amazon\ndisplay_name: Amazon\nbase_url: https://www.amazon.com';
      }
      if (filePath.endsWith('chewy.yaml')) {
        return 'name: chewy\ndisplay_name: Chewy\nbase_url: https://www.chewy.com';
      }
      return '';
    });

    const res = await GET({} as any);
    expect(res?.status).toBe(200);

    const body = await res!.json() as any;
    expect(body.configs).toHaveLength(2);
    expect(body.configs[0]).toMatchObject({
      name: 'amazon',
      display_name: 'Amazon',
      base_url: 'https://www.amazon.com',
    });
  });

  it('returns 401 if not authenticated', async () => {
    (mockSupabase.auth.getUser as any).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await GET({} as any);
    expect(res?.status).toBe(401);
  });

  it('returns 403 if not admin', async () => {
    const profileSelect = {
      eq: mock(() => ({
        single: mock(() => Promise.resolve({ data: { role: 'user' } })),
      })),
    };

    (mockSupabase.from as any).mockReturnValue({
      select: mock(() => profileSelect),
    });

    const res = await GET({} as any);
    expect(res?.status).toBe(403);
  });
});
