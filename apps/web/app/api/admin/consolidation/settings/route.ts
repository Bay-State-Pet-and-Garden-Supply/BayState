import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  type AIConsolidationDefaults,
  getAIConsolidationDefaults,
  upsertAIConsolidationDefaults,
  getAIScrapingCredentialStatuses,
  setAIScrapingProviderSecret,
} from '@/lib/ai-scraping/credentials';

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

    return NextResponse.json({
      defaults,
      statuses,
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
      defaults?: Partial<AIConsolidationDefaults>;
    };
    const {
      openai_api_key,
      defaults,
      ...rawDefaults
    } = body;

    if (openai_api_key && openai_api_key.trim()) {
      await setAIScrapingProviderSecret('openai', openai_api_key, auth.user.id);
      return NextResponse.json({ message: 'OpenAI API key updated successfully' });
    }

    const nextDefaults = defaults ?? rawDefaults;
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
