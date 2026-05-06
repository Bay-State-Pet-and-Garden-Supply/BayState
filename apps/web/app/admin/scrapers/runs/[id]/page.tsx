import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { History } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getScraperRunById, getScraperRunLogs, getScraperRunChunks } from '../actions';
import { RunDetailsClient } from './RunDetailsClient';

export const metadata: Metadata = {
  title: 'Run Details | Admin',
  description: 'Detailed status and logs for a scraper run',
};

type RunDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function RunDetailsPage({ params }: RunDetailPageProps) {
  const { id } = await params;

  const [run, logs, chunks] = await Promise.all([
    getScraperRunById(id), 
    getScraperRunLogs(id),
    getScraperRunChunks(id)
  ]);

  if (!run) {
    notFound();
  }

  return (
    <AdminPageShell
      title="Run Details"
      description={`Monitoring Scrape Job Execution & Batch Progress for run ${id.slice(0, 8)}`}
      icon={<History className="h-5 w-5" />}
    >
      <RunDetailsClient 
        run={run} 
        logs={logs} 
        chunks={chunks} 
      />
    </AdminPageShell>
  );
}
