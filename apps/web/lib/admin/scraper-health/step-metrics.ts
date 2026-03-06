import { createClient } from '@/lib/supabase/client';
import { metricsCache, getCacheKey } from './cache';

const DEFAULT_CACHE_TTL = 30000;

export interface SelectorHealth {
  selector: string;
  found_count: number;
  missed_count: number;
  success_rate: number;
  last_missed_at: string | null;
}

export interface FailingStep {
  step_name: string;
  failure_count: number;
  last_failed_at: string;
  affected_config: string;
}

/**
 * Gets selector health stats from chunk telemetry on test jobs.
 *
 * Unified architecture: reads from scrape_job_chunks.telemetry
 * instead of the legacy scraper_test_runs.selector_health.
 */
export async function getSelectorHealthStats(days = 30, useCache = true): Promise<SelectorHealth[]> {
  const cacheKey = getCacheKey('selector-health', days);

  if (useCache) {
    const cached = metricsCache.get<SelectorHealth[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const supabase = createClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Query chunk telemetry from test jobs
  const { data, error } = await supabase
    .from('scrape_job_chunks')
    .select(`
      telemetry,
      created_at,
      scrape_jobs!inner(test_mode)
    `)
    .eq('scrape_jobs.test_mode', true)
    .gte('created_at', startDate.toISOString())
    .not('telemetry', 'is', null);

  if (error) {
    console.error('Error fetching selector health:', error);
    return [];
  }

  const stats: Record<string, { found: number; missed: number; lastMissed: string | null }> = {};

  data.forEach((chunk: { telemetry: Record<string, unknown>; created_at: string }) => {
    const telemetry = chunk.telemetry;
    if (!telemetry) return;

    // Extract selector results from chunk telemetry
    const selectors = (telemetry.selectors as Array<{ selector_name: string; status: string }>) || [];

    selectors.forEach((sel) => {
      const key = sel.selector_name;
      if (!stats[key]) {
        stats[key] = { found: 0, missed: 0, lastMissed: null };
      }

      if (sel.status === 'FOUND') {
        stats[key].found++;
      } else {
        stats[key].missed++;

        if (!stats[key].lastMissed || new Date(chunk.created_at) > new Date(stats[key].lastMissed!)) {
          stats[key].lastMissed = chunk.created_at;
        }
      }
    });
  });

  const result = Object.entries(stats)
    .map(([selector, data]) => ({
      selector,
      found_count: data.found,
      missed_count: data.missed,
      success_rate: Math.round((data.found / (data.found + data.missed)) * 100),
      last_missed_at: data.lastMissed
    }))
    .sort((a, b) => b.missed_count - a.missed_count)
    .slice(0, 20);

  if (useCache) {
    metricsCache.set(cacheKey, result, DEFAULT_CACHE_TTL);
  }

  return result;
}

/**
 * Gets the top failing steps from test job error messages.
 *
 * Unified architecture: reads from scrape_jobs.error_message
 * WHERE test_mode=true instead of scraper_test_runs.
 */
export async function getTopFailingSteps(days = 30, useCache = true): Promise<FailingStep[]> {
  const cacheKey = getCacheKey('failing-steps', days);

  if (useCache) {
    const cached = metricsCache.get<FailingStep[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const supabase = createClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('scrape_jobs')
    .select(`
      error_message,
      created_at,
      test_metadata
    `)
    .eq('test_mode', true)
    .eq('status', 'failed')
    .gte('created_at', startDate.toISOString())
    .not('error_message', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching failing steps:', error);
    return [];
  }

  const stepFailures: Record<string, FailingStep> = {};

  data.forEach((job: { error_message: string | null; created_at: string; test_metadata: Record<string, unknown> | null }) => {
    const match = job.error_message?.match(/Step '([^']+)' failed/i);
    const stepName = match ? match[1] : 'Unknown Step';

    const displayName = (job.test_metadata?.scraper_display_name as string)
      || (job.test_metadata?.scraper_slug as string)
      || 'Unknown Config';

    const key = `${stepName}-${displayName}`;

    if (!stepFailures[key]) {
      stepFailures[key] = {
        step_name: stepName,
        failure_count: 0,
        last_failed_at: job.created_at,
        affected_config: displayName,
      };
    }

    stepFailures[key].failure_count++;
  });

  const result = Object.values(stepFailures)
    .sort((a, b) => b.failure_count - a.failure_count)
    .slice(0, 10);

  if (useCache) {
    metricsCache.set(cacheKey, result, DEFAULT_CACHE_TTL);
  }

  return result;
}
