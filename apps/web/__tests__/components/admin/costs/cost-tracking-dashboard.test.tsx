import { render, screen, waitFor } from '@testing-library/react';
import { CostTrackingDashboard } from '@/components/admin/costs/CostTrackingDashboard';

const mockCostResponse = {
  dateRange: { start: '2026-04-01', end: '2026-04-30', days: 30 },
  fixedMonthlyTotal: 12.5,
  services: [
    {
      id: 'svc-1',
      service: 'openai',
      display_name: 'OpenAI',
      monthly_cost: 0,
      billing_cycle: 'monthly',
      category: 'ai',
      notes: 'GPT models for product consolidation and AI scraping (usage-based)',
      is_active: true,
    },
  ],
  servicesByCategory: {
    ai: [
      {
        id: 'svc-1',
        service: 'openai',
        display_name: 'OpenAI',
        monthly_cost: 0,
        billing_cycle: 'monthly',
        category: 'ai',
        notes: 'GPT models for product consolidation and AI scraping (usage-based)',
        is_active: true,
      },
    ],
  },
  usage: {
    aiSearch: {
      totalCost: 1.5,
      totalJobs: 2,
      completedJobs: 2,
      failedJobs: 0,
    },
    crawl4ai: {
      totalCost: 0.5,
      totalJobs: 1,
      completedJobs: 1,
      failedJobs: 0,
    },
    consolidation: {
      totalCost: 3,
      totalJobs: 3,
      completedJobs: 2,
      failedJobs: 1,
      totalTokens: 1500,
    },
    byProvider: [
      {
        provider: 'openai',
        totalCost: 3.5,
        totalJobs: 3,
        completedJobs: 2,
        failedJobs: 1,
        totalTokens: 1000,
      },
      {
        provider: 'gemini',
        totalCost: 1.25,
        totalJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        totalTokens: 500,
      },
      {
        provider: 'openai_compatible',
        totalCost: 0.25,
        totalJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        totalTokens: 100,
      },
    ],
    combined: {
      totalCost: 5,
      totalJobs: 6,
    },
  },
  recentUsage: [
    {
      id: 'job-1',
      feature: 'Consolidation',
      status: 'completed',
      provider: 'openai',
      estimated_cost: 1.5,
      total_tokens: 1000,
      created_at: '2026-04-10T10:00:00Z',
      completed_at: '2026-04-10T10:10:00Z',
      description: 'Consolidation batch',
    },
  ],
  estimatedMonthlyTotal: 17.5,
};

describe('CostTrackingDashboard', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCostResponse),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders feature and provider-based cost tracking details', async () => {
    render(<CostTrackingDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Estimated Monthly')).toBeInTheDocument();
    });

    expect(screen.getByText('AI Search (30d)')).toBeInTheDocument();
    expect(screen.getByText('Crawl4AI (30d)')).toBeInTheDocument();
    expect(screen.getByText('Consolidation (30d)')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Usage (30d)')).toBeInTheDocument();
    expect(screen.getByText('Gemini Usage (30d)')).toBeInTheDocument();
    expect(screen.getByText('OpenAI-Compatible Usage (30d)')).toBeInTheDocument();
    expect(screen.getByText('Recent External Usage')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Feature' })).toBeInTheDocument();
    expect(screen.getByText('Consolidation')).toBeInTheDocument();
  });
});
