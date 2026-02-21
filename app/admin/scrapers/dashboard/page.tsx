import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ScraperDashboardClient } from '@/components/admin/scrapers/ScraperDashboardClient';

type CurrentVersion = {
  status?: string | null;
};

type ScraperConfigRow = {
  id: string;
  slug: string;
  display_name: string | null;
  scraper_config_versions: CurrentVersion | CurrentVersion[] | null;
};

type TestRunRow = {
  scraper_id: string;
  status: string;
  created_at: string;
};

function normalizeCurrentVersion(version: ScraperConfigRow['scraper_config_versions']): CurrentVersion | null {
  if (Array.isArray(version)) {
    return version[0] ?? null;
  }
  return version ?? null;
}

function toHealthFromTestStatus(testStatus: string | null): { health_status: string; health_score: number } {
  if (testStatus === 'passed') {
    return { health_status: 'healthy', health_score: 100 };
  }
  if (testStatus === 'failed') {
    return { health_status: 'broken', health_score: 20 };
  }
  if (testStatus === 'partial' || testStatus === 'running') {
    return { health_status: 'degraded', health_score: 60 };
  }
  return { health_status: 'unknown', health_score: 0 };
}

export const metadata: Metadata = {
  title: 'Scraper Dashboard | Admin',
  description: 'Overview of scraper health and test results',
};

export default async function ScraperDashboardPage() {
  const supabase = await createClient();

  const { data: scraperConfigs } = await supabase
    .from('scraper_configs')
    .select(`
      id,
      slug,
      display_name,
      scraper_config_versions!fk_current_version (
        status
      )
    `)
    .order('slug');

  const { data: recentTests } = await supabase
    .from('scraper_test_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: recentJobs } = await supabase
    .from('scrape_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const { count: runnerCount } = await supabase
    .from('scraper_runners')
    .select('*', { count: 'exact', head: true });

  const latestTestByScraper = new Map<string, TestRunRow>();
  for (const test of (recentTests || []) as TestRunRow[]) {
    const existing = latestTestByScraper.get(test.scraper_id);
    if (!existing || new Date(test.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latestTestByScraper.set(test.scraper_id, test);
    }
  }

  const scrapers = ((scraperConfigs || []) as ScraperConfigRow[]).map((config) => {
    const latestTest = latestTestByScraper.get(config.id) ?? null;
    const version = normalizeCurrentVersion(config.scraper_config_versions);
    const health = toHealthFromTestStatus(latestTest?.status ?? null);

    return {
      id: config.id,
      name: config.slug,
      display_name: config.display_name,
      status: version?.status ?? 'draft',
      health_status: health.health_status,
      health_score: health.health_score,
      last_test_at: latestTest?.created_at ?? null,
    };
  });

  const healthCounts = {
    healthy: scrapers.filter((s) => s.health_status === 'healthy').length,
    degraded: scrapers.filter((s) => s.health_status === 'degraded').length,
    broken: scrapers.filter((s) => s.health_status === 'broken').length,
    unknown: scrapers.filter((s) => !s.health_status || s.health_status === 'unknown').length,
  };

  const statusCounts = {
    active: scrapers.filter((s) => s.status === 'published' || s.status === 'active').length,
    draft: scrapers.filter((s) => s.status === 'draft').length,
    disabled: scrapers.filter((s) => s.status === 'disabled' || s.status === 'archived').length,
  };

  return (
    <ScraperDashboardClient
      scrapers={scrapers || []}
      recentTests={recentTests || []}
      recentJobs={recentJobs || []}
      healthCounts={healthCounts}
      statusCounts={statusCounts}
      runnerCount={runnerCount || 0}
    />
  );
}
