import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  type AIConsolidationDefaults,
  getAIConsolidationDefaults,
  upsertAIConsolidationDefaults,
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
    const [defaults, statuses] = await Promise.all([
      getAIConsolidationDefaults(),
      getAIScrapingCredentialStatuses(),
    ]);

    const deepseekStatus = statuses.deepseek;

    return NextResponse.json({
      defaults,
      statuses,
      deepseek_fallback_status: deepseekStatus,
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
      defaults?: Partial<AIConsolidationDefaults>;
    };
    const {
      deepseek_api_key,
      openai_api_key,
      lmstudio_api_key,
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

    // If no defaults to save and we only saved a key, return key-only message
    if (Object.keys(nextDefaults).length === 0) {
      const savedKeys: string[] = [];
      if (deepseek_api_key?.trim()) savedKeys.push('DeepSeek');
      if (openai_api_key?.trim()) savedKeys.push('OpenAI');
      if (lmstudio_api_key?.trim()) savedKeys.push('LM Studio');
      return NextResponse.json({
        message: savedKeys.length > 0
          ? `${savedKeys.join(', ')} API key updated successfully`
          : 'No changes to save',
      });
    }

    // Enforce provider-appropriate settings
    if (nextDefaults.llm_provider === 'lmstudio') {
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
