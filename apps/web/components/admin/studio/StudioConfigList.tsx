import { createClient } from '@/lib/supabase/server';
import { StudioConfigEditorWrapper } from './StudioConfigEditorWrapper';
import type { ScraperConfig } from '../scrapers/ConfigList';

interface StudioConfigListProps {
  page?: number;
  pageSize?: number;
  filter?: string;
}

export async function StudioConfigList({ 
  page = 0, 
  pageSize = 20,
  filter = ''
}: StudioConfigListProps = {}) {
  const supabase = await createClient();

  // Build query with server-side filtering and pagination
  let query = supabase
    .from('scraper_configs')
    .select(`
      id,
      slug,
      display_name,
      domain,
      updated_at,
      scraper_config_versions!fk_config_id (count)
    `, { count: 'exact' })
    .order('updated_at', { ascending: false });

  // Apply text filter server-side
  if (filter) {
    const lowerFilter = filter.toLowerCase();
    query = query.or(`display_name.ilike.%${lowerFilter}%,slug.ilike.%${lowerFilter}%`);
  }

  // Apply pagination
  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data: configs, error, count } = await query;

  if (error) {
    console.error('Error fetching scraper configs:', error);
    return <div className="text-red-500">Error loading configurations</div>;
  }

  // Fetch health metrics only for visible configs (optimization)
  const configIds = configs?.map(c => c.id) || [];
  
  const { data: healthMetrics } = configIds.length > 0 
    ? await supabase
        .from('scraper_health_metrics')
        .select('config_id, passed_runs, total_runs')
        .in('config_id', configIds)
        .order('metric_date', { ascending: false })
    : { data: [] };

  // Build a map for O(1) lookup instead of O(n) find
  const healthMetricsMap = new Map();
  healthMetrics?.forEach(metric => {
    if (!healthMetricsMap.has(metric.config_id)) {
      healthMetricsMap.set(metric.config_id, metric);
    }
  });

  const formattedConfigs: ScraperConfig[] = (configs || []).map((config) => {
    const latestMetric = healthMetricsMap.get(config.id);

    let health_status: ScraperConfig['health_status'] = 'unknown';
    let health_score = 0;

    if (latestMetric && latestMetric.total_runs > 0) {
      const rate = latestMetric.passed_runs / latestMetric.total_runs;
      health_score = Math.round(rate * 100);
      if (rate > 0.9) health_status = 'healthy';
      else if (rate > 0.6) health_status = 'degraded';
      else health_status = 'broken';
    }

    return {
      id: config.id,
      slug: config.slug,
      display_name: config.display_name,
      domain: config.domain,
      status: 'active',
      health_status,
      health_score,
      last_test_at: config.updated_at,
      version_count: config.scraper_config_versions?.[0]?.count || 0,
      updated_at: config.updated_at,
    };
  });

  return (
    <StudioConfigEditorWrapper 
      configs={formattedConfigs} 
      totalCount={count || 0}
      currentPage={page}
      pageSize={pageSize}
      initialFilter={filter}
    />
  );
}

export default StudioConfigList;
