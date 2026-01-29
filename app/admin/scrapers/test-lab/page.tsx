import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { TestLabClient } from '@/components/admin/scrapers/TestLabClient';

export const metadata: Metadata = {
  title: 'Test Lab | Scraper Admin',
  description: 'Test and validate scraper configurations',
};

export const dynamic = 'force-dynamic';

interface ScraperWithConfig {
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

export default async function TestLabPage() {
  const supabase = await createClient();

  // Query scraper_configs joined with the current version (published or validated)
  // If no published version exists, fall back to validated versions for testing
  const { data: scrapersData, error: scrapersError } = await supabase
    .from('scraper_configs')
    .select(`
      id,
      slug,
      display_name,
      domain,
      current_version_id,
      versions:scraper_config_versions!fk_current_version (
        id,
        config,
        status,
        version_number,
        published_at
      )
    `)
    .not('versions.status', 'eq', 'archived')
    .order('slug');

  if (scrapersError) {
    console.error('Error fetching scrapers:', scrapersError);
  }

  // Transform the data to get the current version config
  const scrapers: ScraperWithConfig[] = (scrapersData || []).map((item: Record<string, unknown>) => {
    const versions = item.versions;
    
    // Handle both array and single object from PostgREST embedding
    let currentVersion: Record<string, unknown>;
    if (Array.isArray(versions)) {
      currentVersion = versions[0];
    } else {
      currentVersion = versions as Record<string, unknown>;
    }
    
    const config = (currentVersion?.config as Record<string, unknown>) || {};
    
    return {
      id: item.id as string,
      slug: item.slug as string,
      display_name: item.display_name as string | null,
      domain: item.domain as string,
      config: {
        test_skus: (config.test_skus as string[]) || [],
        fake_skus: (config.fake_skus as string[]) || [],
        edge_case_skus: (config.edge_case_skus as string[]) || [],
        base_url: config.base_url as string || `https://${item.domain}`,
      },
    };
  });

  const { data: recentTests } = await supabase
    .from('scraper_test_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <TestLabClient
      scrapers={scrapers}
      recentTests={(recentTests || []) as TestRun[]}
    />
  );
}
