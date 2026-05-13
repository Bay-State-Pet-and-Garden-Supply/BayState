import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const configs = await getLocalScraperConfigs();

    return NextResponse.json({ configs });
  } catch (err) {
    console.error('Error in scraper configs API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
