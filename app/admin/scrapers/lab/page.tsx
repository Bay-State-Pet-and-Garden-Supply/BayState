// DEPRECATED: This route is deprecated. Use /admin/scrapers/studio instead.
// Redirects are configured in next.config.ts to maintain backward compatibility.
import { TestLabClient } from '@/components/admin/scraper-lab/TestLabClient';
import { createClient } from '@/lib/supabase/server';

interface RawConfig {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string | null;
  current_version_id: string | null;
}

interface TransformedScraper {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string;
  config: {
    test_skus?: string[];
    fake_skus?: string[];
    edge_case_skus?: string[];
    base_url?: string;
  };
}

interface TestRun {
  id: string;
  scraper_id: string;
  scraper_name: string;
  test_type: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
  skus_tested: string[];
  passed_count: number;
  failed_count: number;
}

async function getScrapers(): Promise<TransformedScraper[]> {
  const supabase = await createClient();

  // Fetch configs with their current versions
  const { data: configs, error } = await supabase
    .from('scraper_configs')
    .select('id, slug, display_name, domain, current_version_id')
    .order('display_name');

  if (error || !configs) {
    console.error('Error fetching configs:', error);
    return [];
  }

  // Fetch versions for each config
  const versionIds = configs
    .map((c) => c.current_version_id)
    .filter((id): id is string => !!id);

  const { data: versions } = await supabase
    .from('scraper_config_versions')
    .select('id, config')
    .in('id', versionIds);

  const versionMap = new Map(
    versions?.map((v) => [v.id, v.config as Record<string, unknown>]) || []
  );

  return configs.map((config: RawConfig) => {
    const versionConfig = versionMap.get(config.current_version_id || '') || {};
    return {
      id: config.id,
      slug: config.slug,
      display_name: config.display_name,
      domain: config.domain || '',
      config: {
        test_skus: (versionConfig.test_skus as string[]) || [],
        fake_skus: (versionConfig.fake_skus as string[]) || [],
        edge_case_skus: (versionConfig.edge_case_skus as string[]) || [],
        base_url: versionConfig.base_url as string || `https://${config.domain}`,
      },
    };
  });
}

async function getRecentTestRuns(): Promise<TestRun[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scraper_test_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) {
    console.error('Error fetching test runs:', error);
    return [];
  }

  const scraperIds = [...new Set(data.map((run) => run.scraper_id))];
  
  const { data: scrapers } = await supabase
    .from('scrapers')
    .select('id, display_name, name')
    .in('id', scraperIds);

  const scraperMap = new Map(
    scrapers?.map((s) => [s.id, s.display_name || s.name]) || []
  );

  return data.map((run) => ({
    id: run.id,
    scraper_id: run.scraper_id,
    scraper_name: scraperMap.get(run.scraper_id) || 'Unknown',
    test_type: run.test_type || 'manual',
    status: run.status || 'unknown',
    created_at: run.created_at,
    duration_ms: run.duration_ms || null,
    skus_tested: run.skus_tested || [],
    passed_count: run.passed_count || 0,
    failed_count: run.failed_count || 0,
  }));
}

export default async function ScraperLabPage() {
  const [scrapers, recentTests] = await Promise.all([
    getScrapers(),
    getRecentTestRuns(),
  ]);

  return <TestLabClient scrapers={scrapers} recentTests={recentTests} />;
}
