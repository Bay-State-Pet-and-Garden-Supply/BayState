import { Metadata } from 'next';
import StudioClient from '@/components/admin/scrapers/StudioClient';
import { StudioConfigList } from '@/components/admin/studio/StudioConfigList';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Scraper Studio | Admin',
  description: 'Advanced environment for scraper development and testing',
};

interface ScraperStudioPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ScraperStudioPage({ searchParams }: ScraperStudioPageProps) {
  const params = await searchParams;
  const page = typeof params.page === 'string' ? parseInt(params.page, 10) : 0;
  const filter = typeof params.filter === 'string' ? params.filter : '';

  return (
    <StudioClient
      configsSlot={
        <Suspense fallback={<ConfigListSkeleton />}>
          <StudioConfigList page={page} filter={filter} />
        </Suspense>
      }
    />
  );
}

function ConfigListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-[250px]" />
        <Skeleton className="h-8 w-[100px]" />
      </div>
      <div className="rounded-md border">
        <div className="h-24 p-4 space-y-4">
           <Skeleton className="h-4 w-full" />
           <Skeleton className="h-4 w-full" />
           <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}
