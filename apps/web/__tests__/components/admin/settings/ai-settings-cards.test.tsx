import { render, screen, waitFor } from '@testing-library/react';
import { AIScrapingSettingsCard } from '@/components/admin/settings/AIScrapingSettingsCard';
import { AIConsolidationSettingsCard } from '@/components/admin/settings/AIConsolidationSettingsCard';

const mockSettingsResponse = {
  statuses: {
    gemini: { provider: 'gemini', configured: true, last4: '2468', updated_at: null },
    brave: { provider: 'brave', configured: true, last4: '1357', updated_at: null },
    serpapi: { provider: 'serpapi', configured: true, last4: '9999', updated_at: null },
    openai: { provider: 'openai', configured: true, last4: '1234', updated_at: null },
  },
  defaults: {
    llm_provider: 'gemini',
    llm_model: 'gemini-2.5-flash',
    llm_base_url: null,
    max_search_results: 5,
    max_steps: 15,
    confidence_threshold: 0.7,
  },
  consolidationDefaults: {
    llm_provider: 'gemini',
    llm_model: 'gemini-2.5-flash',
    llm_base_url: null,
    llm_supports_batch_api: true,
    confidence_threshold: 0.7,
  },
};

describe('AI settings cards', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSettingsResponse),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders Gemini and Brave scraping settings without SerpAPI controls', async () => {
    render(<AIScrapingSettingsCard />);

    await waitFor(() => {
      expect(screen.getByLabelText('Gemini API Key')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Brave Search API Key')).toBeInTheDocument();
    expect(screen.queryByLabelText('SerpAPI Key')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Brave Search remains the only optional discovery fallback/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Gemini Ready')).toBeInTheDocument();
    expect(screen.getByText('Brave Ready')).toBeInTheDocument();
  });

  it('renders Gemini-only consolidation messaging after the OpenAI migration', async () => {
    render(<AIConsolidationSettingsCard />);

    await waitFor(() => {
      expect(screen.getByLabelText('Gemini API Key')).toBeInTheDocument();
    });

    expect(screen.getByText(/OpenAI migration is complete/i)).toBeInTheDocument();
    expect(screen.getByText('Gemini Batch Ready')).toBeInTheDocument();
  });
});
