import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getLocalScraperConfig } from '@/lib/admin/scrapers/configs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { slug } = await params;
    const result = await getLocalScraperConfig(slug);

    if (!result) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Error in specific scraper config API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
