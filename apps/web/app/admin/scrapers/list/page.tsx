import { AdminPageShell } from '@/components/admin/admin-page-shell';
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
    <AdminPageShell
      title="Scrapers"
      description="View scraper configurations. Configs are stored as YAML files in the repository."
    >
      <Suspense fallback={<ScraperListSkeleton />}>
        <ScraperListClient initialScrapers={scrapers} />
      </Suspense>
    </AdminPageShell>
  );
}

function ScraperListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-10 w-[180px] rounded-none border border-zinc-950" />
        <Skeleton className="h-10 w-[180px] rounded-none border border-zinc-950" />
        <Skeleton className="h-10 w-[180px] rounded-none border border-zinc-950" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[240px] w-full rounded-none border border-zinc-950" />
        ))}
      </div>
    </div>
  );
}

