import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from apps/web/.env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCleanup() {
  console.log('=== Scraper Pipeline Audit & Cleanup ===\n');

  // 1. Fetch products in extracting state
  console.log('1. Fetching products in "extracting" status...');
  const { data: products, error: productsError } = await supabase
    .from('products_ingestion')
    .select('sku, pipeline_status, updated_at')
    .eq('pipeline_status', 'extracting');

  if (productsError) {
    console.error('Error fetching products:', productsError);
    return;
  }

  if (!products || products.length === 0) {
    console.log('No products currently stuck in "extracting" state! Everything looks good.');
    return;
  }

  console.log(`Found ${products.length} products in "extracting" status:`);
  console.table(products);

  const skus = products.map(p => p.sku);

  // 2. Fetch associated enrichment attempts
  console.log('\n2. Fetching associated enrichment attempts...');
  const { data: attempts, error: attemptsError } = await supabase
    .from('enrichment_attempts')
    .select('id, job_id, sku, status, claimed_by, lease_expires_at, started_at, error_message')
    .in('sku', skus);

  if (attemptsError) {
    console.error('Error fetching attempts:', attemptsError);
    return;
  }

  console.log(`Found ${attempts?.length || 0} associated attempts in the database:`);
  if (attempts && attempts.length > 0) {
    console.table(attempts);
  } else {
    console.log('No active/queued attempts found for these SKUs.');
  }

  interface EnrichmentJob {
    id: string;
    status: string;
    claimed_by?: string | null;
    lease_expires_at?: string | null;
    total_count?: number | null;
    completed_count?: number | null;
    failed_count?: number | null;
  }

  // 3. Fetch associated enrichment jobs
  const jobIds = Array.from(new Set(attempts?.map(a => a.job_id).filter(Boolean) || []));
  let jobs: EnrichmentJob[] = [];
  if (jobIds.length > 0) {
    console.log('\n3. Fetching associated enrichment jobs...');
    const { data: jobsData, error: jobsError } = await supabase
      .from('enrichment_jobs')
      .select('id, status, claimed_by, lease_expires_at, total_count, completed_count, failed_count')
      .in('id', jobIds);
    
    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
    } else {
      jobs = jobsData || [];
      console.log(`Found ${jobs.length} associated jobs:`);
      console.table(jobs);
    }
  }

  // 4. Perform Cleanup/Reset
  console.log('\n4. Starting Cleanup Action...');

  // Reset products back to 'imported' so they can be re-queued/scraped
  console.log(`Resetting ${skus.length} products in products_ingestion from "extracting" to "imported"...`);
  const { error: resetError } = await supabase
    .from('products_ingestion')
    .update({
      pipeline_status: 'imported',
      updated_at: new Date().toISOString(),
      error_message: 'Stuck extracting process reset by cleanup script.',
    })
    .in('sku', skus);

  if (resetError) {
    console.error('Failed to reset product statuses:', resetError);
  } else {
    console.log('Successfully reset products to "imported" status! ✅');
  }

  // Fail stale attempts
  const runningAttemptIds = attempts?.filter(a => a.status === 'running' || a.status === 'queued').map(a => a.id) || [];
  if (runningAttemptIds.length > 0) {
    console.log(`Setting ${runningAttemptIds.length} running/queued attempts to "failed"...`);
    const { error: attemptResetError } = await supabase
      .from('enrichment_attempts')
      .update({
        status: 'failed',
        error_message: 'Runner did not report completion; reset by cleanup script.',
        completed_at: new Date().toISOString(),
      })
      .in('id', runningAttemptIds);

    if (attemptResetError) {
      console.error('Failed to fail stale attempts:', attemptResetError);
    } else {
      console.log('Successfully failed stale attempts! ✅');
    }
  }

  // Fail stale jobs
  const runningJobIds = jobs.filter(j => j.status === 'running' || j.status === 'queued').map(j => j.id);
  if (runningJobIds.length > 0) {
    console.log(`Setting ${runningJobIds.length} running/queued jobs to "completed_with_errors"...`);
    const { error: jobResetError } = await supabase
      .from('enrichment_jobs')
      .update({
        status: 'completed_with_errors',
        error_message: 'Jobs timed out or runner failed to report completion.',
        completed_at: new Date().toISOString(),
      })
      .in('id', runningJobIds);

    if (jobResetError) {
      console.error('Failed to fail stale jobs:', jobResetError);
    } else {
      console.log('Successfully updated stale jobs! ✅');
    }
  }

  console.log('\n=== Cleanup completed successfully! ===');
}

runCleanup();
