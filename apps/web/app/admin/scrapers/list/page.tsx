import { Suspense } from 'react';

import { createClient } from '@/lib/supabase/server';
import { Skeleton } from '@/components/ui/skeleton';
import { ScraperListClient } from './ScraperListClient';

export const metadata = {
  title: 'Scrapers | Admin',
  description: 'View scraper configurations',
};

async function getScrapers() {
  const supabase = await createClient();
  
  const { data: scrapers, error } = await supabase
    .from('scraper_configs')
    .select(`
      id, slug, name, display_name, base_url, domain, scraper_type, status, 
      health_status, health_score, last_test_at, file_path
    `)
    .order('name', { ascending: true, nullsFirst: false });
    
  if (error) {
    console.error('Error fetching scrapers:', error);
    return [];
  }
  
  return scrapers || [];
}

export default async function ScraperListPage() {
  const scrapers = await getScrapers();
  
  return (
    <div className="flex flex-col gap-6 w-full p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#66161D]">Scrapers</h1>
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