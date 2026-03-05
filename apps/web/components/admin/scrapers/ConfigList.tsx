import { createClient } from '@/lib/supabase/server';
import { ConfigListClient } from './ConfigListClient';

export interface ScraperConfig {
  id: string;
  slug: string;
  display_name: string;
  domain: string | null;
  status: string;
  health_status: 'healthy' | 'degraded' | 'broken' | 'unknown';
  health_score: number;
  last_test_at: string | null;
  version_count: number;
  updated_at: string;
}

export async function ConfigList() {
  const supabase = await createClient();

  // Fetch configs joined with versions count
  // We'll use a raw query or multiple queries since we need aggregate counts
  // For now, let's fetch configs and their latest status from the scrapers table 
  // (which seems to be the main table based on 20260103000000_scraper_configs.sql)
  // BUT 20260122000000_scraper_config_versions_rls.sql introduces scraper_configs and versions
  // It seems we should be querying `scraper_configs` and joining with `scraper_config_versions`
  
  // Let's first check what data is actually populated. 
  // Based on migrations, `scraper_configs` is the stable identity.
  // `scrapers` table from 20260103000000 might be legacy or aliased? 
  // Wait, 20260122000000 says "Step 1: Create versioned scraper config tables".
  // And 20260103000000 created `scrapers`.
  // 20260123000001_full_scraper_migration.sql suggests a migration.
  
  // Let's assume `scraper_configs` is the source of truth now.
  
  const { data: configs, error } = await supabase
    .from('scraper_configs')
    .select(`
      id,
      slug,
      display_name,
      domain,
      updated_at,
      scraper_config_versions!fk_config_id (count)
    `)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching scraper configs:', error);
    return <div className="text-red-500">Error loading configurations</div>;
  }

  // We also need health status. That seems to be on the `scrapers` table or `scraper_health_metrics`.
  // 20260212000100_add_scraper_studio_tables.sql adds `scraper_health_metrics`.
  // Let's try to join or fetch separately.
  
  // For this task, we will fetch `scraper_configs` and map it to the client component props.
  // We might need to fetch health status separately if it's not directly linked yet.
  // Let's check if we can get health metrics.
  
  const { data: healthMetrics } = await supabase
    .from('scraper_health_metrics')
    .select('config_id, passed_runs, total_runs')
    .order('metric_date', { ascending: false });

  // Map data to component props
  const formattedConfigs: ScraperConfig[] = (configs || []).map((config) => {
    // Find latest health metric for this config
    const latestMetric = healthMetrics?.find(m => m.config_id === config.id);
    
    // Calculate simple health status based on metric if available
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
      status: 'active', // Default for now as status is on version
      health_status,
      health_score,
      last_test_at: config.updated_at, // Proxy for now
      version_count: config.scraper_config_versions?.[0]?.count || 0,
      updated_at: config.updated_at,
    };
  });

  return <ConfigListClient initialData={formattedConfigs} />;
}
