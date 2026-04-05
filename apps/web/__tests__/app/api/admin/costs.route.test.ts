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
            id: 'batch-1',
            status: 'completed',
            estimated_cost: '1.25',
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            created_at: '2026-04-05T00:00:00Z',
            completed_at: '2026-04-05T00:10:00Z',
            description: 'Consolidation batch',
          },
        ],
        error: null,
      }),
    };

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'service_costs') {
        return serviceCostsQuery;
      }
      if (table === 'batch_jobs') {
        return batchJobsQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('normalizes legacy AI cost labels to Google Gemini API', async () => {
    const response = await GET({ url: 'http://localhost/api/admin/costs?days=30' } as Request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.services[0].service).toBe('google');
    expect(body.services[0].display_name).toBe('Google Gemini API');
    expect(body.services[0].notes).toContain('Gemini models');
    expect(body.ai.consolidation.providerLabel).toBe('Google Gemini API');
  });
});
