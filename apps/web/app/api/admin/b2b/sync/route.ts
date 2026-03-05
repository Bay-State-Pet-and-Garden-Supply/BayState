import { NextRequest, NextResponse } from 'next/server';
import { triggerSync } from '@/lib/b2b/sync-service';
import { DistributorCode, SyncJobType } from '@/lib/b2b/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { distributor_code, job_type = 'catalog' } = body;

    if (!distributor_code) {
      return NextResponse.json(
        { error: 'distributor_code is required' },
        { status: 400 }
      );
    }

    const validDistributors: DistributorCode[] = ['BCI', 'ORGILL', 'PHILLIPS', 'PFX', 'CENTRAL'];
    if (!validDistributors.includes(distributor_code)) {
      return NextResponse.json(
        { error: `Invalid distributor_code: ${distributor_code}` },
        { status: 400 }
      );
    }

    const validJobTypes: SyncJobType[] = ['catalog', 'inventory', 'pricing', 'full'];
    if (!validJobTypes.includes(job_type)) {
      return NextResponse.json(
        { error: `Invalid job_type: ${job_type}` },
        { status: 400 }
      );
    }

    const result = await triggerSync(
      distributor_code as DistributorCode,
      job_type as SyncJobType
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, jobId: result.jobId },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      productsFetched: result.productsFetched,
      productsCreated: result.productsCreated,
      productsUpdated: result.productsUpdated,
    });
  } catch (error) {
    console.error('[API] Failed to trigger B2B sync:', error);
    return NextResponse.json(
      { error: 'Failed to trigger sync' },
      { status: 500 }
    );
  }
}
