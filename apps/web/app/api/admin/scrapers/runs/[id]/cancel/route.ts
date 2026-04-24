import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const nowIso = new Date().toISOString();
    
    // Get the job first so we know which SKUs to revert
    const { data: job, error: fetchError } = await supabase
      .from('scrape_jobs')
      .select('skus')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error(`Error fetching scraper run ${id}:`, fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch scraper run' },
        { status: 500 }
      );
    }

    // Update job status
    const { error: jobError } = await supabase
      .from('scrape_jobs')
      .update({ status: 'cancelled', completed_at: nowIso })
      .eq('id', id);

    if (jobError) {
      console.error(`Error cancelling scraper run ${id}:`, jobError);
      return NextResponse.json(
        { error: 'Failed to cancel scraper run' },
        { status: 500 }
      );
    }

    // Revert products that were in 'scraping' status back to 'imported'
    if (job?.skus && job.skus.length > 0) {
      const { error: productsError } = await supabase
        .from('products_ingestion')
        .update({
          pipeline_status: 'imported',
          updated_at: nowIso,
          error_message: 'Scrape job was cancelled'
        })
        .in('sku', job.skus)
        .eq('pipeline_status', 'scraping');

      if (productsError) {
        console.warn(`Warning: Failed to revert products pipeline status for job ${id}:`, productsError);
      }
    }

    // Also update all chunks for this job to failed
    // This prevents chunks from staying in 'pending' or 'running' status
    // which bloats the "pending/running" count in the API and monitoring UI
    const { error: chunksError } = await supabase
      .from('scrape_job_chunks')
      .update({ 
        status: 'failed', 
        error_message: 'Job was cancelled',
        completed_at: nowIso,
        updated_at: nowIso
      })
      .eq('job_id', id)
      .in('status', ['pending', 'running']);

    if (chunksError) {
      console.warn(`Warning: Failed to cancel chunks for job ${id}:`, chunksError);
      // We don't fail the whole request because the job itself WAS cancelled
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
