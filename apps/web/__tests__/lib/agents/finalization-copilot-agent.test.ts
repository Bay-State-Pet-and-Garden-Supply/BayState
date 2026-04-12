jest.mock('@/lib/ai-scraping/credentials', () => ({
  getAIConsolidationRuntimeConfig: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/tools/finalization-copilot', () => ({
  createFinalizationCopilotTools: jest.fn(),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(({ apiKey }: { apiKey: string }) =>
    (modelId: string) => ({
      apiKey,
      modelId,
    })
  ),
}));

import { createOpenAI } from '@ai-sdk/openai';
import { getAIConsolidationRuntimeConfig } from '@/lib/ai-scraping/credentials';
import { finalizationCopilotAgent } from '@/lib/agents/finalization-copilot-agent';
import { createClient } from '@/lib/supabase/server';
import { EMPTY_FINALIZATION_DRAFT } from '@/lib/pipeline/finalization-draft';
import { createFinalizationCopilotTools } from '@/lib/tools/finalization-copilot';

describe('finalizationCopilotAgent', () => {
  const mockSupabase = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn(() => ({
            ilike: jest.fn(),
          })),
        })),
      })),
    })),
  };

  const context = {
    workspace: {
      totalProducts: 3,
      selectedSku: 'SKU-123',
      dirtySkus: ['SKU-123'],
    },
    selectedProduct: {
      sku: 'SKU-123',
      input: { name: 'Test Product' },
      consolidated: null,
      sources: {},
      selected_images: [],
      confidence_score: 0.9,
    },
    selectedDraft: EMPTY_FINALIZATION_DRAFT,
    selectedSavedDraft: EMPTY_FINALIZATION_DRAFT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    (createFinalizationCopilotTools as jest.Mock).mockReturnValue({});
  });

  it('builds the OpenAI model with the consolidation runtime config', async () => {
    (getAIConsolidationRuntimeConfig as jest.Mock).mockResolvedValue({
      llm_provider: 'openai',
      llm_model: 'gpt-4o',
      llm_base_url: null,
      llm_api_key: 'openai-live-key',
      openai_api_key: 'openai-live-key',
      confidence_threshold: 0.7,
      llm_supports_batch_api: true,
    });

    const prepareCall = (finalizationCopilotAgent as any).settings.prepareCall as (
      options: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;

    const result = await prepareCall({
      model: null,
      tools: {},
      instructions: '',
      stopWhen: undefined,
      options: context,
    });

    expect(getAIConsolidationRuntimeConfig).toHaveBeenCalled();
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'openai-live-key' });
    expect(result.model).toEqual({
      apiKey: 'openai-live-key',
      modelId: 'gpt-4o',
    });
  });

  it('fails fast when the OpenAI key is missing', async () => {
    (getAIConsolidationRuntimeConfig as jest.Mock).mockResolvedValue({
      llm_provider: 'openai',
      llm_model: 'gpt-4o-mini',
      llm_base_url: null,
      llm_api_key: null,
      openai_api_key: undefined,
      confidence_threshold: 0.7,
      llm_supports_batch_api: true,
    });

    const prepareCall = (finalizationCopilotAgent as any).settings.prepareCall as (
      options: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;

    await expect(
      prepareCall({
        model: null,
        tools: {},
        instructions: '',
        stopWhen: undefined,
        options: context,
      })
    ).rejects.toThrow(
      'OpenAI API key is not configured. Save it in Admin -> Settings -> AI Scraping Settings before using Finalization Copilot.'
    );
  });
});
