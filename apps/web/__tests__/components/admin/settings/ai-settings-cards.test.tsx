import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('renders Gemini-only scraping settings without SerpAPI or Brave controls', async () => {
    render(<AIScrapingSettingsCard />);

    await waitFor(() => {
      expect(screen.getByLabelText('Gemini API Key')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Brave Search API Key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('SerpAPI Key')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Legacy SerpAPI and Brave Search discovery keys are deprecated/i)
    ).toBeInTheDocument();
    const scrapingModelCombobox = screen.getByRole('combobox', { name: 'Gemini Model' });
    expect(scrapingModelCombobox).toHaveTextContent('Gemini 2.5 Flash');
    fireEvent.click(scrapingModelCombobox);
    expect(screen.getByText('Gemini 2.5 Pro')).toBeInTheDocument();
    expect(screen.getByText('Gemini Ready')).toBeInTheDocument();
  });

  it('renders Gemini-only consolidation messaging after the OpenAI migration', async () => {
    render(<AIConsolidationSettingsCard />);

    await waitFor(() => {
      expect(screen.getByLabelText('Gemini API Key')).toBeInTheDocument();
    });

    expect(screen.getByText(/OpenAI migration is complete/i)).toBeInTheDocument();
    const consolidationModelCombobox = screen.getByRole('combobox', { name: 'Gemini Model' });
    expect(consolidationModelCombobox).toHaveTextContent('Gemini 2.5 Flash');
    fireEvent.click(consolidationModelCombobox);
    expect(screen.getByText('Higher quality reasoning for tougher extraction and enrichment cases.')).toBeInTheDocument();
    expect(screen.getByText('Gemini Batch Ready')).toBeInTheDocument();
  });
});
