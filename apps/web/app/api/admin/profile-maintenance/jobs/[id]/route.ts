/**
 * GET /api/admin/profile-maintenance/jobs/[id]
 *
 * Read a single profile-maintenance job with its artifact list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();
  const { id: jobId } = await params;

  // Load the job
  const { data: job, error: jobError } = await supabase
    .from('profile_maintenance_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Load associated artifacts
  const { data: artifacts } = await supabase
    .from('profile_maintenance_artifacts')
    .select('id, kind, status, schema_version, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    job,
    artifacts: artifacts ?? [],
  });
}
