import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  type AIConsolidationDefaults,
  getAIConsolidationDefaults,
  upsertAIConsolidationDefaults,
  getAIConsolidationRuntimeConfig,
  getActiveAIProviderConfigForConsolidation,
  getAIScrapingCredentialStatuses,
  setAIScrapingProviderSecret,
} from '@/lib/ai-scraping/credentials';

const LMSTUDIO_BASE_URL_PATTERN = /^https?:\/\//i;

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const [defaults, statuses, runtimeConfig, consolidationActiveConfig] = await Promise.all([
      getAIConsolidationDefaults(),
      getAIScrapingCredentialStatuses(),
      getAIConsolidationRuntimeConfig().catch(() => null),
      getActiveAIProviderConfigForConsolidation().catch(() => null),
    ]);

    return NextResponse.json({
      defaults,
      statuses,
      runtime: runtimeConfig ? {
        provider: runtimeConfig.llm_provider,
        model: runtimeConfig.llm_model,
        base_url: runtimeConfig.llm_base_url,
        confidence_threshold: runtimeConfig.confidence_threshold,
        llm_supports_batch_api: runtimeConfig.llm_supports_batch_api,
        config_id: runtimeConfig.config_id,
      } : null,
      active_consolidation_config: consolidationActiveConfig ? {
        id: consolidationActiveConfig.id,
        name: consolidationActiveConfig.name,
        provider_type: consolidationActiveConfig.provider_type,
        default_model: consolidationActiveConfig.default_model,
      } : null,
      deepseek_fallback_status: statuses.deepseek,
    });
  } catch (error) {
    console.error('[Consolidation Settings] GET failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = (await req.json()) as Partial<AIConsolidationDefaults> & {
      deepseek_api_key?: string;
      openai_api_key?: string;
      lmstudio_api_key?: string;
      gemini_api_key?: string;
      defaults?: Partial<AIConsolidationDefaults>;
    };
    const {
      deepseek_api_key,
      openai_api_key,
      lmstudio_api_key,
      gemini_api_key,
      defaults,
      ...rawDefaults
    } = body;

    // Build defaults to save
    const nextDefaults: Partial<AIConsolidationDefaults> = defaults ?? rawDefaults;

    // Save API keys if provided (do NOT return early — defaults may also need saving)
    if (deepseek_api_key && deepseek_api_key.trim()) {
      await setAIScrapingProviderSecret('deepseek', deepseek_api_key, auth.user.id);
    }

    if (openai_api_key && openai_api_key.trim()) {
      await setAIScrapingProviderSecret('openai', openai_api_key, auth.user.id);
    }

    if (lmstudio_api_key && lmstudio_api_key.trim()) {
      await setAIScrapingProviderSecret('lmstudio', lmstudio_api_key, auth.user.id);
    }

    if (gemini_api_key && gemini_api_key.trim()) {
      await setAIScrapingProviderSecret('gemini', gemini_api_key, auth.user.id);
    }

    // If no defaults to save and we only saved keys, return key-only message
    if (Object.keys(nextDefaults).length === 0) {
      const savedKeys: string[] = [];
      if (deepseek_api_key?.trim()) savedKeys.push('DeepSeek');
      if (openai_api_key?.trim()) savedKeys.push('OpenAI');
      if (lmstudio_api_key?.trim()) savedKeys.push('LM Studio');
      if (gemini_api_key?.trim()) savedKeys.push('Gemini');
      return NextResponse.json({
        message: savedKeys.length > 0
          ? `${savedKeys.join(', ')} API key updated successfully`
          : 'No changes to save',
      });
    }

    // Enforce provider-appropriate settings
    if (nextDefaults.llm_provider === 'gemini') {
      nextDefaults.llm_supports_batch_api = true;
      nextDefaults.llm_base_url = null;

      // Use gemini-3.5-flash as default model if none specified
      if (!nextDefaults.llm_model) {
        nextDefaults.llm_model = 'gemini-3.5-flash';
      }
    } else if (nextDefaults.llm_provider === 'lmstudio') {
      nextDefaults.llm_supports_batch_api = false;

      // Validate base URL for LM Studio
      if (nextDefaults.llm_base_url) {
        const url = nextDefaults.llm_base_url.trim();
        if (!LMSTUDIO_BASE_URL_PATTERN.test(url)) {
          return NextResponse.json(
            { error: 'LM Studio base URL must start with http:// or https://' },
            { status: 400 }
          );
        }
        // Ensure URL ends with /v1 for OpenAI compatibility
        if (!url.endsWith('/v1')) {
          nextDefaults.llm_base_url = url.replace(/\/?$/, '/v1');
        }
      }
    } else if (nextDefaults.llm_provider === 'deepseek' || !nextDefaults.llm_provider) {
      nextDefaults.llm_supports_batch_api = false;
      nextDefaults.llm_base_url = null;
    }

    const updatedDefaults = await upsertAIConsolidationDefaults(nextDefaults as Partial<AIConsolidationDefaults>);
    return NextResponse.json({
      message: 'Settings updated successfully',
      defaults: updatedDefaults,
    });
  } catch (error) {
    console.error('[Consolidation Settings] POST failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update settings' },
      { status: 500 }
    );
  }
}
