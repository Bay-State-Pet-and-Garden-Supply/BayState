import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIScrapingSettingsCard } from '@/components/admin/settings/AIScrapingSettingsCard';
import { AIConsolidationSettingsCard } from '@/components/admin/settings/AIConsolidationSettingsCard';

const mockConsolidationResponse = {
  defaults: {
    llm_provider: 'openai',
    llm_model: 'gpt-4o-mini',
    llm_base_url: null,
    llm_supports_batch_api: true,
    confidence_threshold: 0.7,
  },
  statuses: {
    gemini: { provider: 'gemini', configured: true, last4: '2468', updated_at: null },
    brave: { provider: 'brave', configured: true, last4: '1357', updated_at: null },
    serpapi: { provider: 'serpapi', configured: true, last4: '9999', updated_at: null },
    openai: { provider: 'openai', configured: true, last4: '1234', updated_at: null },
    lmstudio: { provider: 'lmstudio', configured: false, last4: null, updated_at: null },
  },
  openai_fallback_status: { provider: 'openai', configured: true, last4: '1234', updated_at: null },
};

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
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/consolidation/settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConsolidationResponse),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSettingsResponse),
      });
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
    expect(screen.getByLabelText('Serper API Key')).toBeInTheDocument();
    expect(screen.queryByLabelText('Brave Search API Key')).not.toBeInTheDocument();
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

    // Provider options should be visible
    expect(screen.getByText('OpenAI Batch')).toBeInTheDocument();
    expect(screen.getByText('LM Studio Direct Chat')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Batch Ready')).toBeInTheDocument();
  });
});
