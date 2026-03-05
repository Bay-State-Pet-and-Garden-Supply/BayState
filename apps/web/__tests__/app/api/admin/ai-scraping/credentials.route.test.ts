jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    headers: Headers;
    url: string;
    private readonly bodyText: string;

    constructor(input: string | Request | URL, init?: RequestInit) {
      this.url = typeof input === 'string' ? input : 'http://localhost';
      this.headers = new Headers(init?.headers || {});
      this.bodyText = (init?.body as string) || '';
    }

    async json() {
      return this.bodyText ? JSON.parse(this.bodyText) : {};
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status || 200;
      return {
        status,
        json: async () => data,
        ...((data && typeof data === 'object') ? data : {}),
      };
    },
  },
}));

import { GET, POST } from '@/app/api/admin/ai-scraping/credentials/route';
import { createClient } from '@/lib/supabase/server';
import {
  getAIScrapingCredentialStatuses,
  getAIScrapingDefaults,
  setAIScrapingProviderSecret,
  upsertAIScrapingDefaults,
} from '@/lib/ai-scraping/credentials';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/ai-scraping/credentials', () => ({
  getAIScrapingCredentialStatuses: jest.fn(),
  getAIScrapingDefaults: jest.fn(),
  setAIScrapingProviderSecret: jest.fn(),
  upsertAIScrapingDefaults: jest.fn(),
}));

describe('AI scraping credentials admin route', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  } as unknown as ReturnType<typeof createClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);

    (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const profileSelect = {
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { role: 'admin' } }),
      }),
    };

    (mockSupabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue(profileSelect),
    });
  });

  it('returns statuses and defaults on GET', async () => {
    (getAIScrapingCredentialStatuses as jest.Mock).mockResolvedValue({
      openai: { provider: 'openai', configured: true, last4: '1234', updated_at: null },
      brave: { provider: 'brave', configured: false, last4: null, updated_at: null },
    });
    (getAIScrapingDefaults as jest.Mock).mockResolvedValue({
      llm_model: 'gpt-4o-mini',
      max_search_results: 5,
      max_steps: 15,
      confidence_threshold: 0.7,
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.statuses.openai.configured).toBe(true);
    expect(body.defaults.max_steps).toBe(15);
  });

  it('stores new provider keys and defaults on POST', async () => {
    (setAIScrapingProviderSecret as jest.Mock).mockResolvedValue(undefined);
    (upsertAIScrapingDefaults as jest.Mock).mockResolvedValue(undefined);
    (getAIScrapingCredentialStatuses as jest.Mock).mockResolvedValue({
      openai: { provider: 'openai', configured: true, last4: 'abcd', updated_at: null },
      brave: { provider: 'brave', configured: true, last4: 'wxyz', updated_at: null },
    });
    (getAIScrapingDefaults as jest.Mock).mockResolvedValue({
      llm_model: 'gpt-4o',
      max_search_results: 7,
      max_steps: 22,
      confidence_threshold: 0.9,
    });

    const req = {
      json: async () => ({
        openai_api_key: 'sk-test',
        brave_api_key: 'brave-test',
        defaults: {
          llm_model: 'gpt-4o',
          max_search_results: 7,
          max_steps: 22,
          confidence_threshold: 0.9,
        },
      }),
      headers: {
        get: () => null,
      },
    };

    const res = await POST(req as unknown as Request);
    expect(res.status).toBe(200);

    expect(setAIScrapingProviderSecret).toHaveBeenCalledWith('openai', 'sk-test', 'user-1');
    expect(setAIScrapingProviderSecret).toHaveBeenCalledWith('brave', 'brave-test', 'user-1');
    expect(upsertAIScrapingDefaults).toHaveBeenCalled();
  });
});
