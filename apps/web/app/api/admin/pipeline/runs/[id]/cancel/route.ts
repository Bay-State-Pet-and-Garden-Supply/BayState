import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Revert products that were in 'scraping' status back to 'imported'
    if (job?.upcs && job.upcs.length > 0) {
      const { error: productsError } = await supabase
        .from('products_ingestion')
        .update({
          pipeline_status: 'imported',
          updated_at: nowIso,
          error_message: 'Enrichment job was cancelled'
        })
        .in('upc', job.upcs)
        .eq('pipeline_status', 'scraping');

      if (productsError) {
        console.warn(`Warning: Failed to revert products pipeline status for job ${id}:`, productsError);
      }
    }

    // Also update all attempts for this job to failed
    // This prevents attempts from staying in 'pending' or 'running' status
    const { error: attemptsError } = await supabase
      .from('enrichment_attempts')
      .update({ 
        status: 'failed', 
        error_message: 'Job was cancelled',
        completed_at: nowIso,
        updated_at: nowIso
      })
      .eq('job_id', id)
      .in('status', ['pending', 'running']);

    if (attemptsError) {
      console.warn(`Warning: Failed to cancel attempts for job ${id}:`, attemptsError);
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
