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
  name: string;
  status: string;
  last_seen_at: string | null;
  current_job_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

async function getRunner(id: string): Promise<RunnerDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scraper_runners')
    .select('name, status, last_seen_at, current_job_id, metadata, created_at')
    .eq('name', id)
    .single();

  if (error || !data) {
    console.error('Error fetching runner:', error);
    return null;
  }

  const runner = data as DatabaseRunner;

  // Extract optional fields from metadata
  const metadata = runner.metadata || {};
  const region = (metadata.region as string) || null;
  const version = (metadata.version as string) || null;

  return {
    id: runner.name, // Use name as id since it's the primary key
    name: runner.name,
    status: runner.status as RunnerDetail['status'],
    last_seen_at: runner.last_seen_at,
    active_jobs: runner.current_job_id ? 1 : 0, // Infer from current_job_id
    region,
    version,
    metadata,
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
