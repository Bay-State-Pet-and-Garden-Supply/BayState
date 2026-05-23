import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { setActiveConsolidationAIProviderConfig } from '@/lib/ai-scraping/credentials';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing profile ID' }, { status: 400 });
    }

    await setActiveConsolidationAIProviderConfig(id, auth.user.id);
    return NextResponse.json({ 
      success: true, 
      message: 'AI provider profile activated for consolidation successfully' 
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to activate AI provider profile for consolidation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
