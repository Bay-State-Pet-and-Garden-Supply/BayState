import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VersionTimeline } from '@/components/admin/scrapers/version-timeline';
import { ScraperRunsClient } from '@/components/admin/scrapers/ScraperRunsClient';
import { getScraperRuns } from '../../runs/actions';

interface ScraperHistoryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function ScraperHistoryPage({ params }: ScraperHistoryPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // 1. Fetch the config by slug
  const { data: config, error: configError } = await supabase
    .from('scraper_configs')
    .select('id, name, current_version_id')
    .eq('slug', slug)
    .single();

  if (configError || !config) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">History & Runs</h1>
          <p className="text-muted-foreground mt-2">
            View version history and past execution runs for {config.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
              <CardDescription>
                Timeline of configuration changes and published versions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
                <VersionHistoryLoader configId={config.id} currentVersionId={config.current_version_id} />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Runs</CardTitle>
              <CardDescription>
                Recent execution history for this scraper
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
                <ScraperRunsLoader scraperSlug={slug} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

async function VersionHistoryLoader({ 
  configId, 
  currentVersionId 
}: { 
  configId: string;
  currentVersionId: string | null;
}) {
  const supabase = await createClient();
  
  // Fetch all versions for this config, ordered by version number descending
  const { data: versions, error } = await supabase
    .from('scraper_config_versions')
    .select('*')
    .eq('config_id', configId)
    .order('version_number', { ascending: false });
    
  if (error) {
    return (
      <div className="text-sm text-destructive">
        Error loading versions: {error.message}
      </div>
    );
  }

  return (
    <VersionTimeline 
      configId={configId}
      versions={versions || []} 
      currentVersionId={currentVersionId} 
    />
  );
}

async function ScraperRunsLoader({ scraperSlug }: { scraperSlug: string }) {
  // Use existing server action to fetch runs
  const { runs, totalCount } = await getScraperRuns({ 
    scraperName: scraperSlug,
    limit: 20 
  });
  
  return (
    <div className="-mx-6 -my-6">
      {/* Reusing existing component, but might need to adjust styles slightly since it's now in a card */}
      <ScraperRunsClient initialRuns={runs} totalCount={totalCount} />
    </div>
  );
}
