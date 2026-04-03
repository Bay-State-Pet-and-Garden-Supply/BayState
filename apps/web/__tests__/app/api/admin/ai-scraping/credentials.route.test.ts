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
  getAIConsolidationDefaults,
  getAIScrapingCredentialStatuses,
  getAIScrapingDefaults,
  setAIScrapingProviderSecret,
  upsertAIConsolidationDefaults,
  upsertAIScrapingDefaults,
} from '@/lib/ai-scraping/credentials';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/ai-scraping/credentials', () => ({
  getAIConsolidationDefaults: jest.fn(),
  getAIScrapingCredentialStatuses: jest.fn(),
  getAIScrapingDefaults: jest.fn(),
  setAIScrapingProviderSecret: jest.fn(),
  upsertAIConsolidationDefaults: jest.fn(),
  upsertAIScrapingDefaults: jest.fn(),
}));

describe('AI scraping credentials admin route', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  };

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
      openai_compatible: { provider: 'openai_compatible', configured: true, last4: '9876', updated_at: null },
      serpapi: { provider: 'serpapi', configured: true, last4: '5678', updated_at: null },
      brave: { provider: 'brave', configured: false, last4: null, updated_at: null },
    });
    (getAIScrapingDefaults as jest.Mock).mockResolvedValue({
      llm_provider: 'openai_compatible',
      llm_model: 'gpt-4o-mini',
      llm_base_url: 'http://localhost:8000/v1',
      max_search_results: 5,
      max_steps: 15,
      confidence_threshold: 0.7,
    });
    (getAIConsolidationDefaults as jest.Mock).mockResolvedValue({
      llm_provider: 'openai',
      llm_model: 'gpt-4o-mini',
      llm_base_url: null,
      confidence_threshold: 0.7,
      llm_supports_batch_api: true,
    });

    const res = await GET();
    expect(res?.status).toBe(200);

    const body = await res!.json();
    expect(body.statuses.openai.configured).toBe(true);
    expect(body.statuses.openai_compatible.configured).toBe(true);
    expect(body.defaults.max_steps).toBe(15);
    expect(body.consolidationDefaults.llm_supports_batch_api).toBe(true);
  });

  it('stores new provider keys and defaults on POST', async () => {
    (setAIScrapingProviderSecret as jest.Mock).mockResolvedValue(undefined);
    (upsertAIScrapingDefaults as jest.Mock).mockResolvedValue(undefined);
    (upsertAIConsolidationDefaults as jest.Mock).mockResolvedValue(undefined);
    (getAIScrapingCredentialStatuses as jest.Mock).mockResolvedValue({
      openai: { provider: 'openai', configured: true, last4: 'abcd', updated_at: null },
      openai_compatible: { provider: 'openai_compatible', configured: true, last4: '1234', updated_at: null },
      serpapi: { provider: 'serpapi', configured: true, last4: 'efgh', updated_at: null },
      brave: { provider: 'brave', configured: true, last4: 'wxyz', updated_at: null },
    });
    (getAIScrapingDefaults as jest.Mock).mockResolvedValue({
      llm_provider: 'openai',
      llm_model: 'gpt-4o',
      llm_base_url: null,
      max_search_results: 7,
      max_steps: 22,
      confidence_threshold: 0.9,
    });
    (getAIConsolidationDefaults as jest.Mock).mockResolvedValue({
      llm_provider: 'openai_compatible',
      llm_model: 'google/gemma-3-12b-it',
      llm_base_url: 'http://localhost:8000/v1',
      confidence_threshold: 0.8,
      llm_supports_batch_api: false,
    });

    const req = {
      json: async () => ({
        openai_api_key: 'sk-test',
        openai_compatible_api_key: 'local-test',
        serpapi_api_key: 'serpapi-test',
        brave_api_key: 'brave-test',
        defaults: {
          llm_provider: 'openai',
          llm_model: 'gpt-4o',
          llm_base_url: null,
          max_search_results: 7,
          max_steps: 22,
          confidence_threshold: 0.9,
        },
        consolidationDefaults: {
          llm_provider: 'openai_compatible',
          llm_model: 'google/gemma-3-12b-it',
          llm_base_url: 'http://localhost:8000/v1',
          confidence_threshold: 0.8,
          llm_supports_batch_api: false,
        },
      }),
      headers: {
        get: () => null,
      },
    };

    const res = await POST(req as any);
    expect(res?.status).toBe(200);

    expect(setAIScrapingProviderSecret).toHaveBeenCalledWith('openai', 'sk-test', 'user-1');
    expect(setAIScrapingProviderSecret).toHaveBeenCalledWith('openai_compatible', 'local-test', 'user-1');
    expect(setAIScrapingProviderSecret).toHaveBeenCalledWith('serpapi', 'serpapi-test', 'user-1');
    expect(setAIScrapingProviderSecret).toHaveBeenCalledWith('brave', 'brave-test', 'user-1');
    expect(upsertAIScrapingDefaults).toHaveBeenCalled();
    expect(upsertAIConsolidationDefaults).toHaveBeenCalled();
  });
});
