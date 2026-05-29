import { NextRequest, NextResponse } from 'next/server';

import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { jobId } = await params;
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('enrichment_job_logs')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
      .limit(1000);

    if (error) {
      console.error('[Job History API] Failed to fetch enrichment job logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch job history', logs: [] },
        { status: 500 },
      );
    }

    return NextResponse.json({ logs: data ?? [] });
  } catch (error) {
    console.error('[Job History API] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch job history',
        logs: [],
      },
      { status: 500 },
    );
  }
}
