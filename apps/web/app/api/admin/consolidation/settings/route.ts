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

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const [defaults, statuses] = await Promise.all([
      getAIConsolidationDefaults(),
      getAIScrapingCredentialStatuses(),
    ]);

    // Determine if OpenAI fallback key is available
    const openaiStatus = statuses.openai;

    return NextResponse.json({
      defaults,
      statuses,
      openai_fallback_status: openaiStatus,
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
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = (await req.json()) as Partial<AIConsolidationDefaults> & {
      openai_api_key?: string;
      lmstudio_api_key?: string;
      defaults?: Partial<AIConsolidationDefaults>;
    };
    const {
      openai_api_key,
      lmstudio_api_key,
      defaults,
      ...rawDefaults
    } = body;

    // Handle standalone API key saves
    if (openai_api_key && openai_api_key.trim()) {
      await setAIScrapingProviderSecret('openai', openai_api_key, auth.user.id);
      return NextResponse.json({ message: 'OpenAI API key updated successfully' });
    }

    if (lmstudio_api_key && lmstudio_api_key.trim()) {
      await setAIScrapingProviderSecret('lmstudio', lmstudio_api_key, auth.user.id);
      return NextResponse.json({ message: 'LM Studio API key updated successfully' });
    }

    // Build defaults to save
    const nextDefaults: Partial<AIConsolidationDefaults> = defaults ?? rawDefaults;

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
    } else if (nextDefaults.llm_provider === 'openai' || !nextDefaults.llm_provider) {
      nextDefaults.llm_supports_batch_api = true;
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
