import { Metadata } from 'next';
import { getScraperRuns } from './actions';
import { ScraperRunsClient } from '@/components/admin/scrapers/ScraperRunsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Scraper Runs | Admin',
  description: 'View scraper execution history and job status',
};

export default async function ScraperRunsPage() {
  const { runs, totalCount } = await getScraperRuns({ limit: 50 });

  return <ScraperRunsClient initialRuns={runs} totalCount={totalCount} />;
}
