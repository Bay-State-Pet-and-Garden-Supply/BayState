import type { Metadata } from 'next';

import { ScraperRunsClient } from '@/components/admin/scrapers/ScraperRunsClient';

import { getScraperRuns } from './actions';

export const metadata: Metadata = {
  title: 'Scraper Runs | Admin',
  description: 'Execution history for scrape jobs',
};

export default async function ScraperRunsPage() {
  const { runs, totalCount } = await getScraperRuns({ limit: 100 });

  return <ScraperRunsClient initialRuns={runs} totalCount={totalCount} />;
}
