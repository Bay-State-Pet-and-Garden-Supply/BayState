import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { deleteAIProviderConfig } from '@/lib/ai-scraping/credentials';

export async function DELETE(
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

    await deleteAIProviderConfig(id);
    return NextResponse.json({ success: true, message: 'AI provider profile deleted successfully' });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to delete AI provider profile',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
