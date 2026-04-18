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

    expect(body.recentUsage).toHaveLength(3);
    expect(body.estimatedMonthlyTotal).toBe(2.5);
  });
});
