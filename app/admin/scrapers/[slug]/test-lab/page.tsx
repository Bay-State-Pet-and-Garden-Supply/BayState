import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getScraperBySlug } from '../../actions-workbench';
import { TestSkuManager } from '@/components/admin/scrapers/test-sku-manager';
import { TestRunViewer } from '@/components/admin/scrapers/test-run-viewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { ScraperTestSku, TestRunRecord } from '@/lib/admin/scrapers/types';

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
  let version = null;
  if (scraper.current_version_id) {
    const { data } = await supabase
      .from('scraper_config_versions')
      .select('id, version_number, status')
      .eq('id', scraper.current_version_id)
      .single();
    
    version = data;
  }

  // Fetch test SKUs
  const { data: testSkus, error: skusError } = await supabase
    .from('scraper_config_test_skus')
    .select('*')
    .eq('config_id', scraper.id)
    .order('created_at', { ascending: false });

  if (skusError) {
    console.error('Error fetching test SKUs:', skusError);
  }

  // Fetch recent test runs with join to scrape_jobs for real-time status
  const { data: testRuns, error: runsError } = await supabase
    .from('scraper_test_runs')
    .select(`
      *,
      scrape_jobs!inner(status)
    `)
    .eq('scraper_id', scraper.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Map scrape_jobs.status to the status field for real-time accuracy
  const mappedRuns = (testRuns || []).map((run) => ({
    ...run,
    status: run.scrape_jobs?.status || run.status,
  }));

  if (runsError) {
    console.error('Error fetching test runs:', runsError);
  }

  const typedSkus = (testSkus || []) as ScraperTestSku[];
  const typedRuns = mappedRuns as unknown as TestRunRecord[];

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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <TestSkuManager 
            configId={scraper.id} 
            testSkus={typedSkus} 
          />
        </div>
        
        <div className="xl:col-span-2 space-y-6">
          <TestRunViewer 
            configId={scraper.id}
            versionId={version?.id || null}
            testRuns={typedRuns}
            testSkus={typedSkus}
            disabled={!version}
          />
        </div>
      </div>
    </div>
  );
}
