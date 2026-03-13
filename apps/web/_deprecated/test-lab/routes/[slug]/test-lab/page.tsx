import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getScraperBySlug } from '../../actions-workbench';
import { TestLabClient } from '@/components/admin/scrapers/test-lab';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { ScraperTestSku } from '@/lib/admin/scrapers/types';

interface TestLabPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TestLabPage({ params }: TestLabPageProps) {
  const { slug } = await params;
  const scraper = await getScraperBySlug(slug);

  if (!scraper || !scraper.id) {
    notFound();
  }

  const supabase = await createClient();

  // Get current version for running tests
  const { data: version } = await supabase
    .from('scraper_config_versions')
    .select('id, version_number, status')
    .eq('config_id', scraper.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch test SKUs
  const { data: testSkus, error: skusError } = await supabase
    .from('scraper_config_test_skus')
    .select('*')
    .eq('config_id', scraper.id)
    .order('created_at', { ascending: false });

  if (skusError) {
    console.error('Error fetching test SKUs:', skusError);
  }

  // Fetch recent test runs from scrape_jobs (unified architecture)
  const { data: testJobs, error: jobsError } = await supabase
    .from('scrape_jobs')
    .select('id, status, created_at, completed_at, test_metadata, skus, error_message')
    .eq('test_mode', true)
    .contains('scrapers', [scraper.slug])
    .order('created_at', { ascending: false })
    .limit(10);

  if (jobsError) {
    console.error('Error fetching test jobs:', jobsError);
  }

  const typedSkus = (testSkus || []) as ScraperTestSku[];
  const testRuns = testJobs || [];

  return (
    <div className="space-y-6" data-testid="tab-content-test-lab">
      {!version && (
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertTitle>No Configuration Version</AlertTitle>
          <AlertDescription>
            You need to publish a configuration version before you can run tests in the Test Lab.
          </AlertDescription>
        </Alert>
      )}

      <TestLabClient
        configId={scraper.id}
        versionId={version?.id || null}
        scraperName={scraper.display_name || scraper.slug || 'Unknown Scraper'}
        testRuns={testRuns}
        testSkus={typedSkus}
        disabled={!version}
      />
    </div>
  );
}
