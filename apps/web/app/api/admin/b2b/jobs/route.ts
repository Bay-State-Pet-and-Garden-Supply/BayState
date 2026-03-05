import { NextRequest, NextResponse } from 'next/server';
import { getSyncJobs } from '@/lib/b2b/sync-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const feedId = searchParams.get('feed_id') || undefined;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const jobs = await getSyncJobs(feedId, limit);

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[API] Failed to get B2B sync jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
