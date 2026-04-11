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
      gemini_api_key?: string;
      serper_api_key?: string;
      serpapi_api_key?: string;
      defaults?: Partial<AIScrapingDefaults>;
      consolidationDefaults?: Partial<AIConsolidationDefaults>;
    };

    const tasks: Array<Promise<unknown>> = [];

    if (body.gemini_api_key && body.gemini_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('gemini', body.gemini_api_key, auth.userId));
    }

    const searchProviderKey = body.serper_api_key ?? body.serpapi_api_key;
    if (searchProviderKey && searchProviderKey.trim()) {
      tasks.push(setAIScrapingProviderSecret('serpapi', searchProviderKey, auth.userId));
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
