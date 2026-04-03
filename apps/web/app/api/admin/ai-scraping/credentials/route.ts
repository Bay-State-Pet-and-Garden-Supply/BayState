import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { userId: user.id };
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) {
      return auth.error;
    }

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
    const auth = await requireAdmin();
    if ('error' in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      openai_api_key?: string;
      openai_compatible_api_key?: string;
      serpapi_api_key?: string;
      brave_api_key?: string;
      defaults?: Partial<AIScrapingDefaults>;
      consolidationDefaults?: Partial<AIConsolidationDefaults>;
    };

    const tasks: Array<Promise<unknown>> = [];

    if (body.openai_api_key && body.openai_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('openai', body.openai_api_key, auth.userId));
    }

    if (body.openai_compatible_api_key && body.openai_compatible_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('openai_compatible', body.openai_compatible_api_key, auth.userId));
    }

    if (body.serpapi_api_key && body.serpapi_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('serpapi', body.serpapi_api_key, auth.userId));
    }

    if (body.brave_api_key && body.brave_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('brave', body.brave_api_key, auth.userId));
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
