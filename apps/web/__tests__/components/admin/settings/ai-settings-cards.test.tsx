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
    llm_provider: 'openai',
    llm_model: 'gpt-4o-mini',
    llm_base_url: null,
    max_search_results: 5,
    max_steps: 15,
    confidence_threshold: 0.7,
  },
  consolidationDefaults: {
    llm_provider: 'openai',
    llm_model: 'gpt-4o-mini',
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

  it('renders OpenAI scraping settings with deprecated legacy discovery providers hidden', async () => {
    render(<AIScrapingSettingsCard />);

    await waitFor(() => {
      expect(screen.getByLabelText('Gemini API Key (Optional)')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('OpenAI API Key')).toBeInTheDocument();
    expect(screen.queryByLabelText('Brave Search API Key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('SerpAPI Key')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Legacy Gemini scraping settings are deprecated/i)
    ).toBeInTheDocument();
    const scrapingModelCombobox = screen.getByRole('combobox', { name: 'OpenAI Model' });
    expect(scrapingModelCombobox).toHaveTextContent('GPT-4o mini');
    fireEvent.click(scrapingModelCombobox);
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('Gemini Available')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Ready')).toBeInTheDocument();
    expect(
      screen.getByText(/Finalization Copilot now use OpenAI/i)
    ).toBeInTheDocument();
  });

  it('renders OpenAI consolidation messaging', async () => {
    render(<AIConsolidationSettingsCard />);

    await waitFor(() => {
      expect(screen.getByLabelText('OpenAI API Key')).toBeInTheDocument();
    });

    expect(screen.getByText(/OpenAI batch pipeline/i)).toBeInTheDocument();
    const consolidationModelCombobox = screen.getByRole('combobox', { name: 'OpenAI Model' });
    expect(consolidationModelCombobox).toHaveTextContent('GPT-4o mini');
    fireEvent.click(consolidationModelCombobox);
    expect(screen.getByText('Higher quality reasoning for tougher extraction and enrichment cases.')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Batch Ready')).toBeInTheDocument();
  });
});
