jest.mock('@/lib/ai-scraping/credentials', () => ({
  getAIProviderSecret: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/tools/finalization-copilot', () => ({
  createFinalizationCopilotTools: jest.fn(),
}));

jest.mock('ai', () => {
  const actual = jest.requireActual('ai');

  return {
    ...actual,
    createGateway: jest.fn(({ apiKey }: { apiKey: string }) =>
      (modelId: string) => ({
        apiKey,
        modelId,
      })
    ),
  };
});

import { createGateway } from 'ai';
import { getAIProviderSecret } from '@/lib/ai-scraping/credentials';
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
    product: {
      sku: 'SKU-123',
      input: { name: 'Test Product' },
      consolidated: null,
      sources: {},
      selected_images: [],
      confidence_score: 0.9,
    },
    draft: EMPTY_FINALIZATION_DRAFT,
    savedDraft: EMPTY_FINALIZATION_DRAFT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    (createFinalizationCopilotTools as jest.Mock).mockReturnValue({});
  });

  it('builds the gateway model with the stored Gemini key', async () => {
    (getAIProviderSecret as jest.Mock).mockResolvedValue('gemini-live-key');

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

    expect(getAIProviderSecret).toHaveBeenCalledWith('gemini');
    expect(createGateway).toHaveBeenCalledWith({ apiKey: 'gemini-live-key' });
    expect(result.model).toEqual({
      apiKey: 'gemini-live-key',
      modelId: 'google/gemini-3.1-pro-preview',
    });
  });

  it('fails fast when the Gemini key is missing', async () => {
    (getAIProviderSecret as jest.Mock).mockResolvedValue(null);

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
      'Gemini API key is not configured. Save it in Admin -> Settings -> AI Scraping Settings before using Finalization Copilot.'
    );
  });
});
