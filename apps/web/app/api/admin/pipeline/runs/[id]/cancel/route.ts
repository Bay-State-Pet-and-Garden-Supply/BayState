import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const supabase = await createAdminClient();

    const nowIso = new Date().toISOString();
    
    // Get the job first so we know which UPCs to revert
    const { data: job, error: fetchError } = await supabase
      .from('enrichment_jobs')
      .select('upcs')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error(`Error fetching enrichment run ${id}:`, fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch enrichment run' },
        { status: 500 }
      );
    }

    // Update job status
    const { error: jobError } = await supabase
      .from('enrichment_jobs')
      .update({ status: 'cancelled', completed_at: nowIso })
      .eq('id', id);

    if (jobError) {
      console.error(`Error cancelling enrichment run ${id}:`, jobError);
      return NextResponse.json(
        { error: 'Failed to cancel enrichment run' },
        { status: 500 }
      );
    }

    // Revert products that were in 'extracting' status back to 'imported'
    if (job?.upcs && job.upcs.length > 0) {
      const { error: productsError } = await supabase
        .from('products_ingestion')
        .update({
          pipeline_status: 'imported',
          updated_at: nowIso,
          error_message: 'Enrichment job was cancelled'
        })
        .in('upc', job.upcs)
        .eq('pipeline_status', 'extracting');

      if (productsError) {
        console.warn(`Warning: Failed to revert products pipeline status for job ${id}:`, productsError);
      }
    }

    // Cancel all queued/running attempts for this job
    const { error: attemptsError } = await supabase
      .from('enrichment_attempts')
      .update({ 
        status: 'cancelled',
        error_message: 'Job was cancelled',
        completed_at: nowIso,
        updated_at: nowIso,
        lease_token: null,
        lease_expires_at: null,
        claimed_by: null
      })
      .eq('job_id', id)
      .in('status', ['queued', 'running', 'pending']);

    if (attemptsError) {
      console.warn(`Warning: Failed to cancel attempts for job ${id}:`, attemptsError);
    }

    // Mark unattempted sources as skipped in enrichment_source_attempts
    try {
      await supabase
        .from('enrichment_source_attempts')
        .update({
          outcome: 'skipped',
          error_message: 'Job was cancelled',
          updated_at: nowIso
        })
        .eq('job_id', id)
        .is('outcome', null);
    } catch (sourceErr) {
      console.warn(`Warning: Failed to mark unattempted sources as skipped for job ${id}:`, sourceErr);
    }

    // Clear job lease fields
    const { error: leaseError } = await supabase
      .from('enrichment_jobs')
      .update({
        lease_token: null,
        lease_expires_at: null,
        claimed_by: null,
        updated_at: nowIso
      })
      .eq('id', id);

    if (leaseError) {
      console.warn(`Warning: Failed to clear job lease for ${id}:`, leaseError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in cancel endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
