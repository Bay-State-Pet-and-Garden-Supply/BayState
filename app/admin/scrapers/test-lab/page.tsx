// DEPRECATED: This route is deprecated. Use /admin/scrapers/studio instead.
// Redirects are configured in next.config.ts to maintain backward compatibility.
import { TestLabClient } from '@/components/admin/scrapers/TestLabClient';
import { createClient } from '@/lib/supabase/server';

interface RawScraper {
  id: string;
  name: string;
  display_name: string | null;
  base_url: string | null;
  test_skus: string[] | null;
  fake_skus: string[] | null;
  edge_case_skus: string[] | null;
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

  const { data, error } = await supabase
    .from('scrapers')
    .select('id, name, display_name, base_url, test_skus, fake_skus, edge_case_skus')
    .order('name');

  if (error || !data) {
    console.error('Error fetching scrapers:', error);
    return [];
  }

  return data.map((scraper: RawScraper) => ({
    id: scraper.id,
    slug: scraper.name,
    display_name: scraper.display_name,
    domain: scraper.base_url ? new URL(scraper.base_url).hostname : '',
    config: {
      test_skus: scraper.test_skus || [],
      fake_skus: scraper.fake_skus || [],
      edge_case_skus: scraper.edge_case_skus || [],
      base_url: scraper.base_url || undefined,
    },
  }));
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

export default async function ScraperLabLandingPage() {
  const [scrapers, recentTests] = await Promise.all([
    getScrapers(),
    getRecentTestRuns(),
  ]);

  return <TestLabClient scrapers={scrapers} recentTests={recentTests} />;
}
