/**
 * Shared utilities for test job finalization.
 *
 * Used by both the main callback route and the chunk-callback route
 * to compute test results and persist telemetry on scrape_jobs instead
 * of the legacy scraper_test_runs table.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TestJobSummary {
  test_status: 'passed' | 'failed' | 'partial';
  passed_count: number;
  failed_count: number;
  total_skus: number;
  duration_ms: number;
  completed_at: string;
}

export interface ChunkTelemetry {
  steps?: TelemetryStep[];
  selectors?: TelemetrySelector[];
  extractions?: TelemetryExtraction[];
  logins?: TelemetryLogin[];
}

export interface TelemetryStep {
  step_index: number;
  action_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  error_message?: string;
  extracted_data?: Record<string, unknown>;
  sku?: string;
}

export interface TelemetrySelector {
  sku?: string;
  selector_name: string;
  selector_value: string;
  status: 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED';
  error_message?: string;
  duration_ms?: number;
}

export interface TelemetryExtraction {
  sku?: string;
  field_name: string;
  field_value?: string;
  status: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FOUND';
  error_message?: string;
  duration_ms?: number;
}

export interface TelemetryLogin {
  sku?: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  error_message?: string;
  duration_ms?: number;
}

// ─── Finalize Test Job ──────────────────────────────────────────────────────

/**
 * Finalizes a test job by computing pass/fail status from chunk results
 * and updating the scrape_jobs.test_metadata with a summary.
 *
 * Called when all chunks for a test job have completed.
 */
export async function finalizeTestJob(
  supabase: SupabaseClient,
  jobId: string,
  jobStatus: 'completed' | 'failed',
): Promise<TestJobSummary | null> {
  // Fetch all chunks for this job
  const { data: chunks, error: chunksError } = await supabase
    .from('scrape_job_chunks')
    .select('status, skus_processed, skus_successful, skus_failed, results, telemetry')
    .eq('job_id', jobId);

  if (chunksError || !chunks) {
    console.error(`[TestJobUtils] Failed to fetch chunks for job ${jobId}:`, chunksError?.message);
    return null;
  }

  const totalSuccessful = chunks.reduce((sum: number, c: { skus_successful?: number }) => sum + (c.skus_successful || 0), 0);
  const totalFailed = chunks.reduce((sum: number, c: { skus_failed?: number }) => sum + (c.skus_failed || 0), 0);
  const totalSkus = totalSuccessful + totalFailed;

  // Determine test status
  let testStatus: 'passed' | 'failed' | 'partial' = 'failed';
  if (jobStatus === 'completed') {
    testStatus = totalFailed === 0 ? 'passed' : totalSuccessful > 0 ? 'partial' : 'failed';
  }

  // Get job creation time for duration calculation
  const { data: jobData } = await supabase
    .from('scrape_jobs')
    .select('created_at, test_metadata')
    .eq('id', jobId)
    .single();

  const startedAt = jobData?.created_at ? new Date(jobData.created_at).getTime() : Date.now();
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt;

  // Build SKU-level results from chunk data
  const skuResults: Array<{ sku: string; status: string; data?: unknown }> = [];
  for (const chunk of chunks) {
    const chunkResults = (chunk.results as Record<string, Record<string, unknown>>) || {};
    for (const [sku, result] of Object.entries(chunkResults)) {
      const hasData = result && Object.keys(result).some(k => k !== 'scraped_at');
      skuResults.push({
        sku,
        status: hasData ? 'success' : 'no_results',
        data: result,
      });
    }
  }

  const summary: TestJobSummary = {
    test_status: testStatus,
    passed_count: totalSuccessful,
    failed_count: totalFailed,
    total_skus: totalSkus,
    duration_ms: durationMs,
    completed_at: completedAt.toISOString(),
  };

  // Merge test summary into existing test_metadata
  const existingMetadata = (jobData?.test_metadata as Record<string, unknown>) || {};

  const { error: updateError } = await supabase
    .from('scrape_jobs')
    .update({
      test_metadata: {
        ...existingMetadata,
        summary,
        sku_results: skuResults,
      },
    })
    .eq('id', jobId);

  if (updateError) {
    console.error(`[TestJobUtils] Failed to update test_metadata for job ${jobId}:`, updateError.message);
    return null;
  }

  console.log(`[TestJobUtils] Finalized test job ${jobId}: ${testStatus} (${totalSuccessful}/${totalSkus} passed)`);
  return summary;
}

// ─── Persist Chunk Telemetry ────────────────────────────────────────────────

/**
 * Persists telemetry data on the scrape_job_chunks.telemetry column.
 *
 * This replaces the legacy approach of inserting into scraper_test_run_steps,
 * scraper_selector_results, etc.
 */
export async function persistChunkTelemetry(
  supabase: SupabaseClient,
  chunkId: string,
  telemetry: ChunkTelemetry,
): Promise<void> {
  const { error } = await supabase
    .from('scrape_job_chunks')
    .update({ telemetry })
    .eq('id', chunkId);

  if (error) {
    console.warn(`[TestJobUtils] Failed to persist telemetry for chunk ${chunkId}:`, error.message);
  }
}

// ─── Timeout Check ──────────────────────────────────────────────────────────

/**
 * Checks if a job has exceeded its timeout and marks it as failed.
 *
 * Returns true if the job was timed out.
 */
export async function checkJobTimeout(
  supabase: SupabaseClient,
  jobId: string,
): Promise<boolean> {
  const { data: job, error } = await supabase
    .from('scrape_jobs')
    .select('timeout_at, status')
    .eq('id', jobId)
    .single();

  if (error || !job) {
    return false;
  }

  if (!job.timeout_at) {
    return false;
  }

  const isStillActive = job.status === 'pending' || job.status === 'running';
  const isTimedOut = new Date(job.timeout_at) < new Date();

  if (isStillActive && isTimedOut) {
    const { error: updateError } = await supabase
      .from('scrape_jobs')
      .update({
        status: 'failed',
        error_message: 'Test timed out — no runner completed the job within the allowed time.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['pending', 'running']);

    if (updateError) {
      console.warn(`[TestJobUtils] Failed to timeout job ${jobId}:`, updateError.message);
      return false;
    }

    console.log(`[TestJobUtils] Job ${jobId} timed out`);
    return true;
  }

  return false;
}
