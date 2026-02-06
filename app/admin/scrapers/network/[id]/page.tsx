import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RunnerDetailClient, RunnerDetail } from '@/components/admin/scraper-network/runner-detail-client';

export const metadata: Metadata = {
  title: 'Runner Details | Scraper Network',
  description: 'View and manage scraper runner details',
};

interface RunnerDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface DatabaseRunner {
  id: string;
  name: string;
  status: string;
  last_seen_at: string | null;
  active_jobs: number;
  region: string | null;
  version: string | null;
  metadata: Record<string, unknown> | null;
}

async function getRunner(id: string): Promise<RunnerDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scraper_runners')
    .select('id, name, status, last_seen_at, active_jobs, region, version, metadata')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error fetching runner:', error);
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    status: data.status as RunnerDetail['status'],
    last_seen_at: data.last_seen_at,
    active_jobs: data.active_jobs ?? 0,
    region: data.region,
    version: data.version,
    metadata: data.metadata,
  };
}

export default async function RunnerDetailPage({ params }: RunnerDetailPageProps) {
  const { id } = await params;
  const runner = await getRunner(id);

  if (!runner) {
    notFound();
  }

  return (
    <RunnerDetailClient
      runner={runner}
      backHref="/admin/scrapers/network"
    />
  );
}
