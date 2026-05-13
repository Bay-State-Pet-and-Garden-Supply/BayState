import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  type AIConsolidationDefaults,
  type AIScrapingDefaults,
  getAIScrapingCredentialStatuses,
  getAIScrapingDefaults,
  setAIScrapingProviderSecret,
  upsertAIScrapingDefaults,
  getAIConsolidationDefaults,
  upsertAIConsolidationDefaults,
} from '@/lib/ai-scraping/credentials';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const [statuses, defaults, consolidationDefaults] = await Promise.all([
      getAIScrapingCredentialStatuses(),
      getAIScrapingDefaults(),
      getAIConsolidationDefaults(),
    ]);

    return NextResponse.json({ statuses, defaults, consolidationDefaults });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch AI credentials and defaults',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const body = (await request.json()) as {
      deepseek_api_key?: string;
      gemini_api_key?: string;
      openai_api_key?: string;
      lmstudio_api_key?: string;
      serper_api_key?: string;
      serpapi_api_key?: string;
      defaults?: Partial<AIScrapingDefaults>;
      consolidationDefaults?: Partial<AIConsolidationDefaults>;
    };

    const tasks: Array<Promise<unknown>> = [];

    if (body.deepseek_api_key && body.deepseek_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('deepseek', body.deepseek_api_key, auth.user.id));
    }

    if (body.gemini_api_key && body.gemini_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('gemini', body.gemini_api_key, auth.user.id));
    }

    if (body.openai_api_key && body.openai_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('openai', body.openai_api_key, auth.user.id));
    }

    if (body.lmstudio_api_key && body.lmstudio_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('lmstudio', body.lmstudio_api_key, auth.user.id));
    }

    const searchProviderKey = body.serper_api_key ?? body.serpapi_api_key;
    if (searchProviderKey && searchProviderKey.trim()) {
      tasks.push(setAIScrapingProviderSecret('serpapi', searchProviderKey, auth.user.id));
    }

    if (body.defaults) {
      tasks.push(upsertAIScrapingDefaults(body.defaults));
    }

    if (body.consolidationDefaults) {
      tasks.push(upsertAIConsolidationDefaults(body.consolidationDefaults));
    }

    await Promise.all(tasks);

    const [statuses, defaults, consolidationDefaults] = await Promise.all([
      getAIScrapingCredentialStatuses(),
      getAIScrapingDefaults(),
      getAIConsolidationDefaults(),
    ]);

    return NextResponse.json({ success: true, statuses, defaults, consolidationDefaults });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update AI credentials and defaults',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
