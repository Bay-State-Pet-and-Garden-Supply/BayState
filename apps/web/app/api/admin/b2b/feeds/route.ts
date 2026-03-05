import { NextRequest, NextResponse } from 'next/server';
import { getB2BFeeds, updateFeedConfig, testFeedConnection } from '@/lib/b2b/sync-service';
import { DistributorCode } from '@/lib/b2b/types';

export async function GET() {
  try {
    const feeds = await getB2BFeeds();
    return NextResponse.json({ feeds });
  } catch (error) {
    console.error('[API] Failed to get B2B feeds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feeds' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { distributor_code, enabled, sync_frequency, config } = body;

    if (!distributor_code) {
      return NextResponse.json(
        { error: 'distributor_code is required' },
        { status: 400 }
      );
    }

    const result = await updateFeedConfig(distributor_code as DistributorCode, {
      enabled,
      sync_frequency,
      config,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to update B2B feed:', error);
    return NextResponse.json(
      { error: 'Failed to update feed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { distributor_code, action } = body;

    if (!distributor_code) {
      return NextResponse.json(
        { error: 'distributor_code is required' },
        { status: 400 }
      );
    }

    if (action === 'test') {
      const result = await testFeedConnection(distributor_code as DistributorCode);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Failed to process B2B feed action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
