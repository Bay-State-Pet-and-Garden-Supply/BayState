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
  ai: {
    gemini: {
      totalCost: 3.75,
      totalJobs: 4,
      completedJobs: 4,
      failedJobs: 0,
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      providerLabel: 'Google Gemini API',
    },
    openai: {
      totalCost: 1.25,
      totalJobs: 2,
      completedJobs: 1,
      failedJobs: 1,
      promptTokens: 400,
      completionTokens: 200,
      totalTokens: 600,
      providerLabel: 'OpenAI API',
    },
    combined: {
      totalCost: 5,
      totalJobs: 6,
      promptTokens: 1400,
      completionTokens: 700,
      totalTokens: 2100,
    },
    recentJobs: [
      {
        id: 'job-1',
        status: 'completed',
        provider: 'gemini',
        estimated_cost: 3.75,
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        created_at: '2026-04-10T10:00:00Z',
        completed_at: '2026-04-10T10:10:00Z',
        description: 'Gemini catalog consolidation',
      },
      {
        id: 'job-2',
        status: 'failed',
        provider: 'openai_compatible',
        estimated_cost: 1.25,
        prompt_tokens: 400,
        completion_tokens: 200,
        total_tokens: 600,
        created_at: '2026-04-09T09:00:00Z',
        completed_at: null,
        description: 'Legacy OpenAI-compatible enrichment',
      },
    ],
  },
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

  it('renders separate Gemini and OpenAI cost tracking details', async () => {
    render(<CostTrackingDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Gemini Costs (30d)')).toBeInTheDocument();
    });

    expect(screen.getByText('OpenAI Costs (30d)')).toBeInTheDocument();
    expect(screen.getByText('Combined AI Costs (30d)')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Monitor and manage monthly costs across fixed services plus separate Google Gemini API and OpenAI API usage/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Recent Gemini + OpenAI Batch Jobs')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Compatible')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Gemini and OpenAI costs are tracked automatically from Google Gemini API and OpenAI API batch jobs/i
      )
    ).toBeInTheDocument();
  });
});
