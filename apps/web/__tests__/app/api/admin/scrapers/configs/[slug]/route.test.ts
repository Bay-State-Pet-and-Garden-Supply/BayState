import { expect, it, describe, beforeEach, mock } from 'bun:test';
import { GET } from '@/app/api/admin/scrapers/configs/[slug]/route';
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

describe('Specific Scraper config API route', () => {
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

  it('returns YAML content for a valid slug', async () => {
    const yamlContent = 'name: amazon\ndisplay_name: Amazon\nbase_url: https://www.amazon.com';
    (fs.readFileSync as any).mockReturnValue(yamlContent);
    (fs.existsSync as any).mockReturnValue(true);

    const res = await GET({} as any, { params: { slug: 'amazon' } });
    expect(res?.status).toBe(200);

    const body = await res!.json() as any;
    expect(body.yaml).toBe(yamlContent);
    expect(body.config.name).toBe('amazon');
  });

  it('returns 404 if config does not exist', async () => {
    (fs.existsSync as any).mockReturnValue(false);

    const res = await GET({} as any, { params: { slug: 'non-existent' } });
    expect(res?.status).toBe(404);
  });

  it('returns 401 if not authenticated', async () => {
    (mockSupabase.auth.getUser as any).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await GET({} as any, { params: { slug: 'amazon' } });
    expect(res?.status).toBe(401);
  });
});
