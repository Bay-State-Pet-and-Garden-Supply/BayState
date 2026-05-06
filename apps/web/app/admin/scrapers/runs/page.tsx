import type { Metadata } from 'next';
import { History } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { ScraperRunsClient } from '@/components/admin/scrapers/ScraperRunsClient';
import { getScraperRuns } from './actions';

export const metadata: Metadata = {
  title: 'Scraper Runs | Admin',
  description: 'Execution history for scrape jobs',
};

export default async function ScraperRunsPage() {
  const { runs, totalCount } = await getScraperRuns({ limit: 100 });

  return (
    <AdminPageShell
      title="Scraper Runs"
      description="Execution history for scrape jobs"
      icon={<History className="h-5 w-5" />}
    >
      <ScraperRunsClient initialRuns={runs} totalCount={totalCount} />
    </AdminPageShell>
  );
}
