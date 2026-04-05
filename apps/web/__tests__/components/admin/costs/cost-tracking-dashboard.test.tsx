import { render, screen, waitFor } from '@testing-library/react';
import { CostTrackingDashboard } from '@/components/admin/costs/CostTrackingDashboard';

const mockCostResponse = {
  dateRange: { start: '2026-04-01', end: '2026-04-30', days: 30 },
  fixedMonthlyTotal: 12.5,
  services: [
    {
      id: 'svc-1',
      service: 'google',
      display_name: 'Google Gemini API',
      monthly_cost: 0,
      billing_cycle: 'monthly',
      category: 'ai',
      notes: 'Gemini models for product consolidation and AI scraping (usage-based)',
      is_active: true,
    },
  ],
  servicesByCategory: {
    ai: [
      {
        id: 'svc-1',
        service: 'google',
        display_name: 'Google Gemini API',
        monthly_cost: 0,
        billing_cycle: 'monthly',
        category: 'ai',
        notes: 'Gemini models for product consolidation and AI scraping (usage-based)',
        is_active: true,
      },
    ],
  },
  ai: {
    consolidation: {
      totalCost: 3.75,
      totalJobs: 4,
      completedJobs: 4,
      failedJobs: 0,
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      providerLabel: 'Google Gemini API',
    },
    recentJobs: [],
  },
  estimatedMonthlyTotal: 16.25,
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

  it('renders Google Gemini cost labels instead of legacy OpenAI labels', async () => {
    render(<CostTrackingDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Google API Costs (30d)')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Monitor and manage monthly costs across all services and Google Gemini API usage/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Google Gemini API')).toBeInTheDocument();
    expect(
      screen.getByText(/AI costs are tracked automatically from Google Gemini API batch jobs/i)
    ).toBeInTheDocument();
  });
});
