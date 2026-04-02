/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextRequest } from 'next/server';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock('@/lib/scraper-auth', () => ({
  validateRunnerAuth: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/admin/scrapers/configs', () => ({
  getLocalScraperConfigs: jest.fn(),
}));

jest.mock('@/lib/ai-scraping/credentials', () => ({
  getAIScrapingDefaults: jest.fn(),
  getAIScrapingRuntimeCredentials: jest.fn(),
}));

const loginConfig = {
  url: 'https://supplier.example.com/login',
  username_field: '#username',
  password_field: '#password',
  submit_button: '#submit-login',
  success_indicator: '.account-home',
  timeout: 60,
};

const localScraperConfig = {
  slug: 'orgill',
  name: 'orgill',
  status: 'active',
  base_url: 'https://supplier.example.com',
  selectors: [{ name: 'Name', selector: 'h1', attribute: 'text' }],
  workflows: [{ action: 'login', name: null, params: {} }],
  timeout: 30,
  retries: 2,
  validation: { no_results_selectors: ['.no-results'] },
  login: loginConfig,
  credential_refs: ['orgill'],
  test_skus: ['SKU-1'],
};

function createRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return {
    url,
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  } as unknown as NextRequest;
}

function createPollSupabase() {
  const mock: any = {
    from: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockImplementation(async () => ({ data: null, error: null })),
    rpc: (jest.fn().mockImplementation(async () => ({
      data: [{
        job_id: 'job-123',
        skus: ['SKU-1'],
        scrapers: ['orgill'],
        test_mode: false,
        max_workers: 1,
      }],
      error: null,
    })) as any,
    channel: jest.fn().mockReturnValue({
      send: (jest.fn().mockImplementation(async () => undefined)) as any,
    }),
  };

  Object.defineProperty(mock, 'then', {
    value: jest.fn((resolve: (value: { data: { name: string; enabled: boolean; status: string }[]; error: null }) => void) => {
      resolve({ data: [{ name: 'runner-1', enabled: true, status: 'active' }], error: null });
    }),
    enumerable: false,
  });

  return mock;
}

function createJobSupabase() {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn<any>().mockResolvedValue({
            data: {
              id: 'job-123',
              skus: ['SKU-1'],
              scrapers: ['orgill'],
              test_mode: false,
              max_workers: 1,
              type: 'standard',
              config: null,
              lease_token: null,
              lease_expires_at: null,
            },
            error: null,
          }),
        }),
      }),
    }),
  };
}

describe('runner scraper config forwarding', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    jest.clearAllMocks();

    const { validateRunnerAuth } = jest.requireMock('@/lib/scraper-auth') as {
      validateRunnerAuth: { mockResolvedValue: (value: unknown) => void };
    };
    const { getLocalScraperConfigs } = jest.requireMock('@/lib/admin/scrapers/configs') as {
      getLocalScraperConfigs: { mockResolvedValue: (value: unknown) => void };
    };
    const {
      getAIScrapingDefaults,
      getAIScrapingRuntimeCredentials,
    } = jest.requireMock('@/lib/ai-scraping/credentials') as {
      getAIScrapingDefaults: { mockResolvedValue: (value: unknown) => void };
      getAIScrapingRuntimeCredentials: { mockResolvedValue: (value: unknown) => void };
    };

    validateRunnerAuth.mockResolvedValue({
      runnerName: 'runner-1',
      authMethod: 'apiKey',
      allowedScrapers: null,
    });
    getLocalScraperConfigs.mockResolvedValue([localScraperConfig]);
    getAIScrapingDefaults.mockResolvedValue({
      llm_model: 'gpt-4o-mini',
      max_search_results: 5,
      max_steps: 15,
      confidence_threshold: 0.7,
    });
    getAIScrapingRuntimeCredentials.mockResolvedValue(null);
  });

  it('forwards login config in poll responses', async () => {
    const { createClient } = jest.requireMock('@supabase/supabase-js') as {
      createClient: { mockReturnValue: (value: unknown) => void };
    };
    createClient.mockReturnValue(createPollSupabase());
    const { POST } = await import('@/app/api/scraper/v1/poll/route');

    const response = await POST(createRequest('http://localhost/api/scraper/v1/poll'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.job.scrapers).toHaveLength(1);
    expect(body.job.scrapers[0]).toMatchObject({
      name: 'orgill',
      login: loginConfig,
      credential_refs: ['orgill'],
    });
  });

  it('forwards login config in direct job responses', async () => {
    const { createClient } = jest.requireMock('@supabase/supabase-js') as {
      createClient: { mockReturnValue: (value: unknown) => void };
    };
    createClient.mockReturnValue(createJobSupabase());
    const { GET } = await import('@/app/api/scraper/v1/job/route');

    const response = await GET(createRequest('http://localhost/api/scraper/v1/job?job_id=job-123'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scrapers).toHaveLength(1);
    expect(body.scrapers[0]).toMatchObject({
      name: 'orgill',
      login: loginConfig,
      credential_refs: ['orgill'],
    });
  });
});
