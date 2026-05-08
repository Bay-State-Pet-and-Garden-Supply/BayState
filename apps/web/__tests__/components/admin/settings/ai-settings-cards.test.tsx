import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIScrapingSettingsCard } from '@/components/admin/settings/AIScrapingSettingsCard';
import { AIConsolidationSettingsCard } from '@/components/admin/settings/AIConsolidationSettingsCard';

const mockConsolidationResponse = {
  defaults: {
    llm_provider: 'deepseek',
    llm_model: 'deepseek-chat',
    llm_base_url: null,
    llm_supports_batch_api: false,
    confidence_threshold: 0.7,
  },
  statuses: {
    deepseek: { provider: 'deepseek', configured: true, last4: '1234', updated_at: null },
    gemini: { provider: 'gemini', configured: true, last4: '2468', updated_at: null },
    brave: { provider: 'brave', configured: true, last4: '1357', updated_at: null },
    serpapi: { provider: 'serpapi', configured: true, last4: '9999', updated_at: null },
    openai: { provider: 'openai', configured: true, last4: '0000', updated_at: null },
    lmstudio: { provider: 'lmstudio', configured: false, last4: null, updated_at: null },
  },
  deepseek_fallback_status: { provider: 'deepseek', configured: true, last4: '1234', updated_at: null },
};

const mockSettingsResponse = {
  statuses: {
    deepseek: { provider: 'deepseek', configured: true, last4: '1234', updated_at: null },
    gemini: { provider: 'gemini', configured: true, last4: '2468', updated_at: null },
    brave: { provider: 'brave', configured: true, last4: '1357', updated_at: null },
    serpapi: { provider: 'serpapi', configured: true, last4: '9999', updated_at: null },
    openai: { provider: 'openai', configured: true, last4: '0000', updated_at: null },
  },
  defaults: {
    llm_provider: 'deepseek',
    llm_model: 'deepseek-chat',
    llm_base_url: null,
    max_search_results: 5,
    max_steps: 15,
    confidence_threshold: 0.7,
  },
  consolidationDefaults: {
    llm_provider: 'deepseek',
    llm_model: 'deepseek-chat',
    llm_base_url: null,
    llm_supports_batch_api: false,
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

  it('renders DeepSeek scraping settings with deprecated legacy discovery providers hidden', async () => {
    render(<AIScrapingSettingsCard />);

    await waitFor(() => {
      expect(screen.getByLabelText('Gemini API Key (Optional)')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('DeepSeek API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Serper API Key')).toBeInTheDocument();
    expect(screen.queryByLabelText('Brave Search API Key')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Legacy Gemini and OpenAI scraping settings are deprecated/i)
    ).toBeInTheDocument();
    const scrapingModelCombobox = screen.getByRole('combobox', { name: 'DeepSeek Model' });
    expect(scrapingModelCombobox).toHaveTextContent('DeepSeek Chat');
    fireEvent.click(scrapingModelCombobox);
    expect(screen.getByText('DeepSeek Reasoner')).toBeInTheDocument();
    expect(screen.getByText('Gemini Available')).toBeInTheDocument();
    expect(screen.getByText('DeepSeek Ready')).toBeInTheDocument();
    expect(
      screen.getByText(/Finalization Copilot now use DeepSeek/i)
    ).toBeInTheDocument();
  });

  it('renders DeepSeek consolidation messaging', async () => {
    render(<AIConsolidationSettingsCard />);

    await waitFor(() => {
      expect(screen.getByLabelText('DeepSeek API Key')).toBeInTheDocument();
    });

    expect(screen.getByText('DeepSeek Hosted')).toBeInTheDocument();
    expect(screen.getByText('LM Studio Direct Chat')).toBeInTheDocument();
    expect(screen.getByText('DeepSeek Hosted Ready')).toBeInTheDocument();
    expect(screen.getByText('Processing: Synthetic async')).toBeInTheDocument();
  });
});
