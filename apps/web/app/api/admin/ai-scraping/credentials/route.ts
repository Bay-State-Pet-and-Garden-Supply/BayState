import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAIScrapingCredentialStatuses,
  getAIScrapingDefaults,
  setAIScrapingProviderSecret,
  upsertAIScrapingDefaults,
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

    const [statuses, defaults] = await Promise.all([
      getAIScrapingCredentialStatuses(),
      getAIScrapingDefaults(),
    ]);

    return NextResponse.json({ statuses, defaults });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch AI scraping credentials',
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
      brave_api_key?: string;
      defaults?: {
        llm_model?: 'gpt-4o-mini' | 'gpt-4o';
        max_search_results?: number;
        max_steps?: number;
        confidence_threshold?: number;
      };
    };

    const tasks: Array<Promise<unknown>> = [];

    if (body.openai_api_key && body.openai_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('openai', body.openai_api_key, auth.userId));
    }

    if (body.brave_api_key && body.brave_api_key.trim()) {
      tasks.push(setAIScrapingProviderSecret('brave', body.brave_api_key, auth.userId));
    }

    if (body.defaults) {
      tasks.push(upsertAIScrapingDefaults(body.defaults));
    }

    await Promise.all(tasks);

    const [statuses, defaults] = await Promise.all([
      getAIScrapingCredentialStatuses(),
      getAIScrapingDefaults(),
    ]);

    return NextResponse.json({ success: true, statuses, defaults });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update AI scraping credentials',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
