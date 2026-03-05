import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';

interface ActiveConsolidation {
  id: string;
  status: string;
  totalProducts: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  createdAt: string;
  progress: number;
}

export async function GET(_request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  const { data: batchJobs, error } = await supabase
    .from('batch_jobs')
    .select('id, status, total_requests, completed_requests, failed_requests, created_at')
    .not('status', 'in', ['completed', 'failed', 'expired'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Active Consolidations] Failed to fetch batch jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active consolidation jobs' },
      { status: 500 }
    );
  }

  const consolidations: ActiveConsolidation[] = (batchJobs || []).map((job) => {
    const totalProducts = job.total_requests || 0;
    const processedCount = (job.completed_requests || 0) + (job.failed_requests || 0);
    const successCount = job.completed_requests || 0;
    const errorCount = job.failed_requests || 0;
    const progress = totalProducts > 0 ? Math.round((processedCount / totalProducts) * 100) : 0;

    return {
      id: job.id,
      status: job.status,
      totalProducts,
      processedCount,
      successCount,
      errorCount,
      createdAt: job.created_at,
      progress,
    };
  });

  return NextResponse.json({ consolidations });
}
