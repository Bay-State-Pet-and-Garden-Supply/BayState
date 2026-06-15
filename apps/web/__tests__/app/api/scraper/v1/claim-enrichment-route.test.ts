/**
 * Tests for POST /api/scraper/v1/claim-enrichment
 *
 * The runner polls this endpoint to claim the next queued enrichment attempt.
 * Must return the exact JSON shape expected by ClaimedEnrichment dataclass.
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/scraper-auth', () => ({
  validateRunnerAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));
jest.mock('@/lib/ai-scraping/credentials', () => ({
  getAIScrapingRuntimeCredentialsForConfig: jest.fn(),
}));

const { NextRequest } = require('next/server');
const { validateRunnerAuth } = require('@/lib/scraper-auth');
const { createAdminClient } = require('@/lib/supabase/server');
const { getAIScrapingRuntimeCredentialsForConfig } = require('@/lib/ai-scraping/credentials');
const { POST } = require('@/app/api/scraper/v1/claim-enrichment/route');

function makeMockSupabase(rpcResult: any, jobResult?: any) {
  const rpcFn = jest.fn().mockResolvedValue({ data: rpcResult, error: null });
  let selectQuery: any;
  
  const mockClient = {
    rpc: rpcFn,
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue(
            jobResult ?? { data: null, error: { message: 'not found' } },
          ),
        }),
      }),
    }),
  };

  return { mockClient, rpcFn };
}

describe('POST /api/scraper/v1/claim-enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });
    (getAIScrapingRuntimeCredentialsForConfig as jest.Mock).mockResolvedValue({
      llm_provider: 'deepseek',
      llm_model: 'deepseek-chat',
      llm_api_key: 'llm-key',
      deepseek_api_key: 'llm-key',
      serper_api_key: 'serper-key',
      serpapi_api_key: 'serper-key',
      config_id: 'config-1',
    });
  });

  it('returns 401 when auth fails', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/claim-enrichment', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_invalid' },
      }),
    );
    expect(response.status).toBe(401);
  });

  it('returns empty attempts array when no pending work', async () => {
    const { mockClient } = makeMockSupabase(null);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/claim-enrichment', {
        method: 'POST',
        body: JSON.stringify({ runner_name: 'test-runner' }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attempts).toEqual([]);
  });

  it('returns a claimed attempt with source_plan', async () => {
    const rpcResult = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      job_id: '660e8400-e29b-41d4-a716-446655440001',
      upc: '072705115310',
      target_id: null,
      attempt_number: 1,
      mode: 'mixed',
      model: null,
      source_url: 'approved_source_extraction',
      lease_token: '770e8400-e29b-41d4-a716-446655440002',
      lease_expires_at: '2026-06-14T13:00:00Z',
    };

    const jobResult = {
      data: {
        id: '660e8400-e29b-41d4-a716-446655440001',
        test_mode: false,
        config_id: 'config-1',
        config: {
          source_plans_by_upc: {
            '072705115310': {
              schemaVersion: 'v1',
              upc: '072705115310',
              brand: { id: 'brand-1', name: 'Test Brand', slug: 'test-brand' },
              extractionMode: 'mixed',
              priority: [
                {
                  sourceType: 'distributor',
                  sourceSlug: 'phillips',
                  domains: ['phillips.com'],
                },
              ],
            },
          },
        },
      },
      error: null,
    };

    const { mockClient, rpcFn } = makeMockSupabase(rpcResult, jobResult);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/claim-enrichment', {
        method: 'POST',
        body: JSON.stringify({ runner_name: 'test-runner' }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attempts).toHaveLength(1);

    const attempt = body.attempts[0];
    // Runner-expected keys (ClaimedEnrichment dataclass)
    expect(attempt.id).toBe(rpcResult.id);
    expect(attempt.job_id).toBe(rpcResult.job_id);
    expect(attempt.upc).toBe(rpcResult.upc);
    expect(attempt.source_url).toBe('approved_source_extraction');
    expect(attempt.lease_token).toBe(rpcResult.lease_token);
    expect(attempt.lease_expires_at).toBe(rpcResult.lease_expires_at);
    expect(attempt.mode).toBe('mixed');
    expect(attempt.test_mode).toBe(false);
    expect(attempt.ai_credentials).toEqual(expect.objectContaining({
      llm_provider: 'deepseek',
      serper_api_key: 'serper-key',
      serpapi_api_key: 'serper-key',
    }));
    expect(getAIScrapingRuntimeCredentialsForConfig).toHaveBeenCalledWith('config-1');
    expect(attempt.source_plan).toBeDefined();
    expect(attempt.source_plan.upc).toBe('072705115310');
  });
});

export {};
