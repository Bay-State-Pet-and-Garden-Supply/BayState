jest.mock('next/server', () => ({
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

import { GET } from '@/app/api/admin/costs/route';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('admin costs route', () => {
  const mockSupabase = {
    from: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);

    const serviceCostsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'svc-1',
            service: 'openai',
            display_name: 'OpenAI',
            monthly_cost: '0.00',
            billing_cycle: 'monthly',
            category: 'ai',
            notes: 'GPT models for product consolidation and AI scraping (usage-based)',
            is_active: true,
          },
        ],
        error: null,
      }),
    };

    const batchJobsQuery = {
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'batch-gemini',
            status: 'completed',
            provider: 'gemini',
            estimated_cost: '1.25',
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            created_at: '2026-04-05T00:00:00Z',
            completed_at: '2026-04-05T00:10:00Z',
            description: 'Gemini consolidation batch',
          },
          {
            id: 'batch-openai',
            status: 'failed',
            provider: 'openai',
            estimated_cost: '0.75',
            prompt_tokens: 60,
            completion_tokens: 40,
            total_tokens: 100,
            created_at: '2026-04-04T00:00:00Z',
            completed_at: null,
            description: 'OpenAI consolidation batch',
          },
          {
            id: 'batch-compatible',
            status: 'completed',
            provider: 'openai_compatible',
            estimated_cost: '0.50',
            prompt_tokens: 30,
            completion_tokens: 20,
            total_tokens: 50,
            created_at: '2026-04-03T00:00:00Z',
            completed_at: '2026-04-03T00:08:00Z',
            description: 'OpenAI compatible batch',
          },
        ],
        error: null,
      }),
    };

    const scrapeJobsQuery = {
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    };

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') return serviceCostsQuery;
      if (table === 'batch_jobs') return batchJobsQuery;
      if (table === 'scrape_jobs') return scrapeJobsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('returns cost summaries in the usage structure', async () => {
    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.services[0].service).toBe('openai');
    expect(body.usage.consolidation).toEqual({
      totalCost: 2.5,
      totalJobs: 3,
      completedJobs: 2,
      failedJobs: 1,
      promptTokens: 190,
      completionTokens: 110,
      totalTokens: 300,
    });

    expect(body.usage.aiSearch).toEqual({
      totalCost: 0,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
    });

    expect(body.usage.byProvider).toEqual([
      {
        provider: 'openai',
        totalCost: 0.75,
        totalJobs: 1,
        completedJobs: 0,
        failedJobs: 1,
        totalTokens: 100,
      },
      {
        provider: 'gemini',
        totalCost: 1.25,
        totalJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        totalTokens: 150,
      },
      {
        provider: 'openai_compatible',
        totalCost: 0.5,
        totalJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        totalTokens: 50,
      },
    ]);

    expect(body.recentUsage).toHaveLength(3);
    expect(body.estimatedMonthlyTotal).toBe(2.5);
  });
});

describe('admin costs route — scraper metadata preservation', () => {
  const mockSupabase = {
    from: jest.fn(),
  };

  const AI_SEARCH_METADATA = {
    ai_search: {
      total_cost: 0.042,
      llm_provider: 'openai',
      model: 'gpt-4o-mini',
      pages_scraped: 5,
    },
    total_cost: 0.042,
  };

  const CRAWL4AI_METADATA = {
    crawl4ai: {
      cost_breakdown: {
        total_cost_usd: 0.018,
        costs: {
          total_cost_usd: 0.018,
          input_tokens: 1200,
          output_tokens: 300,
        },
      },
      pages_crawled: 3,
    },
    total_cost: 0.018,
  };

  const MIXED_METADATA = {
    ai_search: {
      total_cost: 0.055,
      llm_provider: 'gemini',
      model: 'gemini-2.5-flash',
    },
    crawl4ai: {
      cost_breakdown: {
        total_cost_usd: 0.012,
        costs: {
          total_cost_usd: 0.012,
        },
      },
    },
    total_cost: 0.067,
  };

  function buildScrapeJob(overrides: Partial<{
    id: string;
    type: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    scrapers: string[] | null;
    metadata: Record<string, unknown> | null;
  }> = {}) {
    return {
      id: 'job-1',
      type: 'ai_search',
      status: 'completed',
      created_at: '2026-04-20T00:00:00Z',
      completed_at: '2026-04-20T00:05:00Z',
      scrapers: null,
      metadata: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);

    const serviceCostsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const batchJobsQuery = {
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const scrapeJobsQuery = {
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') return serviceCostsQuery;
      if (table === 'batch_jobs') return batchJobsQuery;
      if (table === 'scrape_jobs') return scrapeJobsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('extracts ai_search cost from metadata.ai_search.total_cost', async () => {
    const aiSearchJob = buildScrapeJob({
      type: 'ai_search',
      metadata: AI_SEARCH_METADATA,
    });

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'batch_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'scrape_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [aiSearchJob], error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    const body = await response.json();

    expect(body.usage.aiSearch.totalCost).toBe(0.042);
    expect(body.usage.aiSearch.totalJobs).toBe(1);
    expect(body.usage.aiSearch.completedJobs).toBe(1);
  });

  it('extracts crawl4ai cost from metadata.crawl4ai.cost_breakdown', async () => {
    const crawl4aiJob = buildScrapeJob({
      id: 'job-c4ai',
      type: 'crawl4ai',
      scrapers: ['crawl4ai_discovery'],
      metadata: CRAWL4AI_METADATA,
    });

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'batch_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'scrape_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [crawl4aiJob], error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    const body = await response.json();

    expect(body.usage.crawl4ai.totalCost).toBe(0.018);
    expect(body.usage.crawl4ai.totalJobs).toBe(1);
  });

  it('preserves non-zero scraper AI cost bucket in combined total', async () => {
    const aiSearchJob = buildScrapeJob({
      type: 'ai_search',
      metadata: AI_SEARCH_METADATA,
    });
    const crawl4aiJob = buildScrapeJob({
      id: 'job-c4ai',
      type: 'crawl4ai',
      scrapers: ['crawl4ai'],
      metadata: CRAWL4AI_METADATA,
    });

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'batch_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'scrape_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [aiSearchJob, crawl4aiJob], error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    const body = await response.json();

    expect(body.usage.aiSearch.totalCost).toBe(0.042);
    expect(body.usage.crawl4ai.totalCost).toBe(0.018);
    expect(body.usage.combined.totalCost).toBeCloseTo(0.06, 2);
    expect(body.usage.combined.totalJobs).toBe(2);
  });

  it('extracts ai_search cost from metadata.total_cost when ai_search.total_cost is absent', async () => {
    const job = buildScrapeJob({
      type: 'ai_search',
      metadata: { total_cost: 0.033, ai_search: { llm_provider: 'openai' } },
    });

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'batch_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'scrape_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [job], error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    const body = await response.json();

    expect(body.usage.aiSearch.totalCost).toBe(0.033);
  });

  it('extracts crawl4ai cost from metadata.total_cost when cost_breakdown is absent', async () => {
    const job = buildScrapeJob({
      id: 'job-c4ai-fallback',
      type: 'crawl4ai',
      scrapers: ['crawl4ai'],
      metadata: { total_cost: 0.025, crawl4ai: { pages_crawled: 2 } },
    });

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'batch_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'scrape_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [job], error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    const body = await response.json();

    expect(body.usage.crawl4ai.totalCost).toBe(0.025);
  });

  it('classifies jobs by scrapers array when type does not match', async () => {
    const mixedJob = buildScrapeJob({
      id: 'job-mixed',
      type: 'full_scrape',
      scrapers: ['ai_search', 'crawl4ai_discovery'],
      metadata: MIXED_METADATA,
    });

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'batch_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'scrape_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [mixedJob], error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    const body = await response.json();

    expect(body.usage.aiSearch.totalJobs).toBe(1);
    expect(body.usage.crawl4ai.totalJobs).toBe(1);
    expect(body.usage.aiSearch.totalCost + body.usage.crawl4ai.totalCost).toBeGreaterThan(0);
  });

  it('includes scraper AI costs in recentUsage records', async () => {
    const aiSearchJob = buildScrapeJob({
      type: 'ai_search',
      metadata: AI_SEARCH_METADATA,
    });

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'batch_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'scrape_jobs') {
        return { select: jest.fn().mockReturnThis(), gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [aiSearchJob], error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    const body = await response.json();

    expect(body.recentUsage).toHaveLength(1);
    expect(body.recentUsage[0].feature).toBe('AI Search');
    expect(body.recentUsage[0].estimated_cost).toBe(0.042);
    expect(body.recentUsage[0].provider).toBe('openai');
  });
});
