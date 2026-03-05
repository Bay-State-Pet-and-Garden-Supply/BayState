import { createClient } from '@/lib/supabase/client';
import { metricsCache, getCacheKey } from './cache';

const DEFAULT_CACHE_TTL = 30000;
const AGGREGATED_CACHE_TTL = 60000;

export interface ScraperHealthMetric {
  id: string;
  config_id: string;
  metric_date: string;
  total_runs: number;
  passed_runs: number;
  failed_runs: number;
  avg_duration_ms: number;
  top_failing_step: string | null;
  selector_health: Record<string, { status: string; success_rate: number }>;
  created_at: string;
  config_name?: string;
}

export async function getScraperHealthMetrics(
  configId?: string,
  days = 30,
  useCache = true
): Promise<ScraperHealthMetric[]> {
  const cacheKey = getCacheKey('health-metrics', configId ?? 'all', days);

  if (useCache) {
    const cached = metricsCache.get<ScraperHealthMetric[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const supabase = createClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let query = supabase
    .from('scraper_health_metrics')
    .select(`
      *,
      scraper_configs (
        display_name,
        slug
      )
    `)
    .gte('metric_date', startDate.toISOString().split('T')[0])
    .order('metric_date', { ascending: true });

  if (configId) {
    query = query.eq('config_id', configId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching health metrics:', error);
    return [];
  }

  const result = data.map((item: any) => ({
    ...item,
    config_name: item.scraper_configs?.display_name,
  }));

  if (useCache) {
    metricsCache.set(cacheKey, result, DEFAULT_CACHE_TTL);
  }

  return result;
}

export async function getAggregatedHealthStats(days = 30, useCache = true) {
  const cacheKey = getCacheKey('aggregated-health', days);

  if (useCache) {
    const cached = metricsCache.get<ReturnType<typeof calculateAggregatedStats>>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const metrics = await getScraperHealthMetrics(undefined, days, useCache);
  const result = calculateAggregatedStats(metrics);

  if (useCache) {
    metricsCache.set(cacheKey, result, AGGREGATED_CACHE_TTL);
  }

  return result;
}

function calculateAggregatedStats(metrics: ScraperHealthMetric[]) {
  const aggregated = metrics.reduce(
    (acc, curr) => {
      const date = curr.metric_date;
      if (!acc[date]) {
        acc[date] = {
          date,
          total_runs: 0,
          passed_runs: 0,
          failed_runs: 0,
          avg_duration_ms: 0,
          duration_sum: 0,
          count: 0,
        };
      }

      acc[date].total_runs += curr.total_runs;
      acc[date].passed_runs += curr.passed_runs;
      acc[date].failed_runs += curr.failed_runs;
      acc[date].duration_sum += curr.avg_duration_ms * curr.total_runs;
      acc[date].count += curr.total_runs;

      return acc;
    },
    {} as Record<
      string,
      {
        date: string;
        total_runs: number;
        passed_runs: number;
        failed_runs: number;
        avg_duration_ms: number;
        duration_sum: number;
        count: number;
      }
    >
  );

  return Object.values(aggregated)
    .map((stat) => ({
      ...stat,
      avg_duration_ms:
        stat.count > 0 ? Math.round(stat.duration_sum / stat.count) : 0,
      pass_rate:
        stat.total_runs > 0
          ? Math.round((stat.passed_runs / stat.total_runs) * 100)
          : 0,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function invalidateHealthMetricsCache(configId?: string): void {
  if (configId) {
    metricsCache.invalidate(getCacheKey('health-metrics', configId));
  } else {
    metricsCache.invalidate();
  }
}
