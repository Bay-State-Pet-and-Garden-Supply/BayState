import { Suspense } from 'react';

import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScraperListClient } from './ScraperListClient';

export const metadata = {
  title: 'Scrapers | Admin',
  description: 'View scraper configurations',
};

export const dynamic = 'force-dynamic';

export default async function ScraperListPage() {
  const scrapers = await getLocalScraperConfigs();
  
  return (
    <div className="flex flex-col gap-6 w-full p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#66161D]">Scrapers (VERIFIED)</h1>
          <p className="text-muted-foreground mt-1">
            View scraper configurations. Configs are stored as YAML files in the repository.
          </p>
        </div>
      </div>

      <Suspense fallback={<ScraperListSkeleton />}>
        <ScraperListClient initialScrapers={scrapers} />
      </Suspense>
    </div>
  );
}

function ScraperListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-10 w-[180px]" />
        <Skeleton className="h-10 w-[180px]" />
        <Skeleton className="h-10 w-[180px]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[240px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}