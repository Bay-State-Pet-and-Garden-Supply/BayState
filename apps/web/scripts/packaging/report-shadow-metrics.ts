/**
 * Shadow Packaging Extraction Metrics Report
 *
 * Aggregates product_packaging_extractions and product_title_suggestions
 * for a configurable time window and reports operational metrics.
 *
 * Usage:
 *   bun run scripts/packaging/report-shadow-metrics.ts
 *   bun run scripts/packaging/report-shadow-metrics.ts --since=24h
 *   bun run scripts/packaging/report-shadow-metrics.ts --since=7d
 *   bun run scripts/packaging/report-shadow-metrics.ts --since=all
 */

import { createAdminClient } from '../../lib/supabase/server';

// =============================================================================
// Types
// =============================================================================

interface MetricsReport {
  window: string;
  generated_at: string;
  total: number;
  by_status: Record<string, number>;
  success_rate_pct: number;
  skipped_no_images_rate_pct: number;
  latency_stats: {
    p50_seconds: number | null;
    p95_seconds: number | null;
    min_seconds: number | null;
    max_seconds: number | null;
    count: number;
  };
  model_distribution: Record<string, number>;
  confidence_buckets: Record<string, number>;
  top_errors: Array<{ error_code: string; count: number }>;
  trigger_breakdown: Record<string, number>;
  category_insights: string[];
  title_suggestions: {
    total: number;
    by_mode: Record<string, number>;
    by_status: Record<string, number>;
  };
}

// =============================================================================
// Helpers
// =============================================================================

function sinceToTimestamp(since: string): string | null {
  switch (since) {
    case '24h':
      return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case 'all':
      return null; // no filter
    default:
      // Try to parse numeric hours, e.g. --since=48h
      const match = since.match(/^(\d+)h$/);
      if (match) {
        return new Date(Date.now() - parseInt(match[1], 10) * 60 * 60 * 1000).toISOString();
      }
      // Default to 24h
      return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }
}

function pPercentile(sorted: number[], pct: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(Math.floor(sorted.length * pct), sorted.length - 1);
  return sorted[idx];
}

function bucketConfidence(score: number | null): string {
  if (score === null) return 'no_confidence';
  if (score < 0.5) return '0.0-0.5';
  if (score < 0.7) return '0.5-0.7';
  if (score < 0.8) return '0.7-0.8';
  if (score < 0.9) return '0.8-0.9';
  return '0.9-1.0';
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sinceArg = args.find((a) => a.startsWith('--since='));
  const since = sinceArg ? sinceArg.split('=')[1] : '24h';
  const sinceTimestamp = sinceToTimestamp(since);

  const supabase = await createAdminClient();

  // Build query
  let query = supabase
    .from('product_packaging_extractions')
    .select('*', { count: 'exact' });

  if (sinceTimestamp) {
    query = query.gte('created_at', sinceTimestamp);
  }

  const { data: extractions, error, count } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to query extractions:', error.message);
    process.exit(1);
  }

  const total = count ?? extractions?.length ?? 0;

  // =========================================================================
  // By status
  // =========================================================================
  const byStatus: Record<string, number> = {};
  const latencies: number[] = [];
  const modelDist: Record<string, number> = {};
  const confBuckets: Record<string, number> = {};
  const errorCounts: Record<string, number> = {};
  const triggerBreakdown: Record<string, number> = {};
  let totalErrors = 0;
  let skippedNoImages = 0;

  for (const row of extractions ?? []) {
    const status = (row.status ?? 'unknown') as string;
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    const trigger = (row.trigger ?? 'unknown') as string;
    triggerBreakdown[trigger] = (triggerBreakdown[trigger] ?? 0) + 1;

    if (status === 'skipped_no_images') {
      skippedNoImages++;
    }

    // Latency for completed extractions
    if (status === 'succeeded' || status === 'failed') {
      const started = row.started_at ? new Date(row.started_at).getTime() : null;
      const completed = row.completed_at ? new Date(row.completed_at).getTime() : null;
      if (started && completed) {
        latencies.push((completed - started) / 1000);
      }
    }

    // Model distribution
    if (row.model) {
      const model = row.model as string;
      modelDist[model] = (modelDist[model] ?? 0) + 1;
    }

    // Confidence histogram (succeeded rows)
    if (status === 'succeeded' && row.overall_confidence !== null) {
      const bucket = bucketConfidence(row.overall_confidence as number | null);
      confBuckets[bucket] = (confBuckets[bucket] ?? 0) + 1;
    }

    // Error codes
    if (row.error_code) {
      const code = row.error_code as string;
      errorCounts[code] = (errorCounts[code] ?? 0) + 1;
      totalErrors++;
    }
  }

  // P50/P95 latency
  const sortedLatencies = latencies.slice().sort((a, b) => a - b);
  const p50 = pPercentile(sortedLatencies, 0.5);
  const p95 = pPercentile(sortedLatencies, 0.95);
  const minLat = sortedLatencies.length > 0 ? sortedLatencies[0] : null;
  const maxLat = sortedLatencies.length > 0 ? sortedLatencies[sortedLatencies.length - 1] : null;

  // Success rate
  const succeeded = byStatus['succeeded'] ?? 0;
  const successRatePct = total ? Math.round((succeeded / total) * 10000) / 100 : 0;
  const skippedRatePct = total ? Math.round((skippedNoImages / total) * 10000) / 100 : 0;

  // Top errors
  const topErrors = Object.entries(errorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([error_code, count]) => ({ error_code, count }));

  // Fetch title suggestions for same time window
  let titleQuery = supabase
    .from('product_title_suggestions')
    .select('*', { count: 'exact' });

  if (sinceTimestamp) {
    titleQuery = titleQuery.gte('created_at', sinceTimestamp);
  }

  const { data: suggestions } = await titleQuery.order('created_at', { ascending: false });

  const titleByMode: Record<string, number> = {};
  const titleByStatus: Record<string, number> = {};

  for (const s of suggestions ?? []) {
    const mode = (s.mode ?? 'unknown') as string;
    const status = (s.status ?? 'unknown') as string;
    titleByMode[mode] = (titleByMode[mode] ?? 0) + 1;
    titleByStatus[status] = (titleByStatus[status] ?? 0) + 1;
  }

  // Category insights: extract product type from UPC prefix heuristics
  // This is limited since the extraction table doesn't store category directly
  const categoryInsights: string[] = [];
  if (total > 0) {
    categoryInsights.push(`Total extractions: ${total}`);
    categoryInsights.push(`With latency data: ${sortedLatencies.length} / ${total}`);
    categoryInsights.push(`With model info: ${Object.keys(modelDist).length > 0 ? 'yes' : 'no'}`);
    categoryInsights.push(`Error rate: ${total ? Math.round((totalErrors / total) * 10000) / 100 : 0}% (${totalErrors} errors)`);
    categoryInsights.push(`Skipped (no images): ${skippedNoImages}`);
    if (latencies.length > 0) {
      categoryInsights.push(`Latency range: ${formatDuration(minLat!)} - ${formatDuration(maxLat!)}`);
    }
  }

  // =========================================================================
  // Output
  // =========================================================================
  const now = new Date().toISOString();
  const windowLabel = since === 'all' ? 'all time' : `last ${since}`;

  console.log('='.repeat(60));
  console.log('  Packaging Extraction Shadow Metrics');
  console.log(`  Window: ${windowLabel}`);
  console.log(`  Generated: ${now}`);
  console.log('='.repeat(60));
  console.log('');

  // Overview
  console.log('── Overview ──');
  console.log(`  Total extractions:     ${total}`);
  console.log(`  Success rate:          ${successRatePct}%`);
  console.log(`  Skipped (no images):   ${skippedRatePct}%`);
  console.log('');

  // Status breakdown
  console.log('── Status Breakdown ──');
  for (const [status, count] of Object.entries(byStatus).sort()) {
    const pct = total ? Math.round((count / total) * 10000) / 100 : 0;
    console.log(`  ${status.padEnd(20)} ${String(count).padStart(6)} (${pct}%)`);
  }
  console.log('');

  // Latency
  console.log('── Latency ──');
  console.log(`  Count:               ${sortedLatencies.length}`);
  console.log(`  p50:                 ${p50 !== null ? formatDuration(p50) : 'N/A'}`);
  console.log(`  p95:                 ${p95 !== null ? formatDuration(p95) : 'N/A'}`);
  console.log(`  Min:                 ${minLat !== null ? formatDuration(minLat) : 'N/A'}`);
  console.log(`  Max:                 ${maxLat !== null ? formatDuration(maxLat) : 'N/A'}`);
  console.log('');

  // Confidence histogram
  console.log('── Confidence Histogram ──');
  const bucketOrder = ['0.0-0.5', '0.5-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'];
  const totalConf = Object.values(confBuckets).reduce((a, b) => a + b, 0);
  for (const bucket of bucketOrder) {
    const count = confBuckets[bucket] ?? 0;
    const pct = totalConf ? Math.round((count / totalConf) * 10000) / 100 : 0;
    const bar = (count > 0 && totalConf > 0)
      ? '█'.repeat(Math.max(1, Math.round((count / totalConf) * 40)))
      : '';
    console.log(`  ${bucket.padEnd(12)} ${String(count).padStart(6)} (${pct}%) ${bar}`);
  }
  console.log('');

  // Model distribution
  if (Object.keys(modelDist).length > 0) {
    console.log('── Model Distribution ──');
    for (const [model, count] of Object.entries(modelDist).sort(([, a], [, b]) => b - a)) {
      const pct = total ? Math.round((count / total) * 10000) / 100 : 0;
      console.log(`  ${model.padEnd(30)} ${String(count).padStart(5)} (${pct}%)`);
    }
    console.log('');
  }

  // Trigger breakdown
  if (Object.keys(triggerBreakdown).length > 0) {
    console.log('── Trigger Breakdown ──');
    for (const [trigger, count] of Object.entries(triggerBreakdown).sort(([, a], [, b]) => b - a)) {
      const pct = total ? Math.round((count / total) * 10000) / 100 : 0;
      console.log(`  ${trigger.padEnd(20)} ${String(count).padStart(5)} (${pct}%)`);
    }
    console.log('');
  }

  // Top errors
  if (topErrors.length > 0) {
    console.log('── Top Errors ──');
    for (const { error_code, count } of topErrors) {
      const pct = totalErrors ? Math.round((count / totalErrors) * 10000) / 100 : 0;
      console.log(`  ${error_code.padEnd(25)} ${String(count).padStart(5)} (${pct}%)`);
    }
    console.log('');
  }

  // Title suggestions
  console.log('── Title Suggestions ──');
  console.log(`  Total:               ${suggestions?.length ?? 0}`);
  console.log(`  By mode:`);
  for (const [mode, count] of Object.entries(titleByMode).sort()) {
    console.log(`    ${mode.padEnd(30)} ${count}`);
  }
  console.log(`  By status:`);
  for (const [status, count] of Object.entries(titleByStatus).sort()) {
    console.log(`    ${status.padEnd(20)} ${count}`);
  }
  console.log('');

  // Category insights
  if (categoryInsights.length > 0) {
    console.log('── Insights ──');
    for (const line of categoryInsights) {
      console.log(`  ${line}`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
