import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getSupabaseAdmin } from '@/lib/ai-scraping/credentials';

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

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('ai_provider_configs')
      .update({ 
        is_active_for_consolidation: false, 
        updated_at: new Date().toISOString(), 
        updated_by: auth.user.id 
      })
      .eq('id', id);

    if (error) {
      console.error('[Consolidation API] Failed to deactivate consolidation profile:', error);
      return NextResponse.json(
        { error: 'Failed to deactivate consolidation profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'AI provider profile deactivated for consolidation' 
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to deactivate AI provider profile for consolidation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
