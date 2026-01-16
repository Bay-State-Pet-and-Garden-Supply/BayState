import { Suspense } from 'react';
import { Metadata } from 'next';
import { Database } from 'lucide-react';
import { FeedGrid, FeedGridSkeleton } from '@/components/admin/b2b/feed-grid';
import { SyncHistory, SyncHistorySkeleton } from '@/components/admin/b2b/sync-history';
import { B2BFeed, B2BSyncJob } from '@/lib/b2b/types';

export const metadata: Metadata = {
  title: 'B2B Data Feeds | Admin',
  description: 'Manage B2B distributor data feeds and sync status',
};

async function getFeeds(): Promise<B2BFeed[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/b2b/feeds`, {
       cache: 'no-store',
       next: { tags: ['b2b-feeds'] }
    });
    if (!res.ok) {
        return MOCK_FEEDS;
    }
    const data = await res.json();
    return data.feeds || [];
  } catch (e) {
    console.error('Failed to fetch feeds', e);
    return MOCK_FEEDS;
  }
}

async function getJobs(): Promise<B2BSyncJob[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/b2b/jobs?limit=10`, {
       cache: 'no-store',
       next: { tags: ['b2b-jobs'] }
    });
    if (!res.ok) {
        return MOCK_JOBS;
    }
    const data = await res.json();
    return data.jobs || [];
  } catch (e) {
    console.error('Failed to fetch jobs', e);
    return MOCK_JOBS;
  }
}

export default async function B2BPage() {
  const feedsData = getFeeds();
  const jobsData = getJobs();
  
  const [feeds, jobs] = await Promise.all([feedsData, jobsData]);

  return (
    <div className="space-y-8 p-8 pt-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#008850]/10">
          <Database className="h-5 w-5 text-[#008850]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">B2B Data Feeds</h1>
          <p className="text-sm text-gray-600">Monitor and manage distributor product data streams</p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Feed Status</h2>
        <Suspense fallback={<FeedGridSkeleton />}>
          <FeedGrid feeds={feeds} />
        </Suspense>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Recent Sync Activity</h2>
        <Suspense fallback={<SyncHistorySkeleton />}>
           <SyncHistory jobs={jobs} feeds={feeds} />
        </Suspense>
      </div>
    </div>
  );
}

const MOCK_FEEDS: B2BFeed[] = [
    {
        id: '1',
        distributor_code: 'BCI',
        display_name: 'Big Commerce Inc',
        feed_type: 'SFTP',
        status: 'healthy',
        last_sync_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        enabled: true,
        products_count: 12500,
        last_sync_job_id: 'job_1',
        sync_frequency: 'daily',
        config: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '2',
        distributor_code: 'ORGILL',
        display_name: 'Orgill',
        feed_type: 'EDI',
        status: 'degraded',
        last_sync_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        enabled: true,
        products_count: 45000,
        last_sync_job_id: 'job_2',
        sync_frequency: 'daily',
        config: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '3',
        distributor_code: 'PHILLIPS',
        display_name: 'Phillips Pet',
        feed_type: 'REST',
        status: 'offline',
        last_sync_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        enabled: true,
        products_count: 8900,
        last_sync_job_id: 'job_3',
        sync_frequency: 'daily',
        config: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '4',
        distributor_code: 'CENTRAL',
        display_name: 'Central Pet',
        feed_type: 'EDI',
        status: 'healthy',
        last_sync_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        enabled: true,
        products_count: 15600,
        last_sync_job_id: 'job_4',
        sync_frequency: 'daily',
        config: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '5',
        distributor_code: 'PFX',
        display_name: 'Pet Food Experts',
        feed_type: 'REST',
        status: 'unconfigured',
        last_sync_at: null,
        enabled: false,
        products_count: 0,
        last_sync_job_id: null,
        sync_frequency: 'manual',
        config: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

const MOCK_JOBS: B2BSyncJob[] = [
    {
        id: 'job_1',
        feed_id: '1',
        job_type: 'inventory',
        status: 'completed',
        products_fetched: 12500,
        products_created: 0,
        products_updated: 12450,
        products_failed: 0,
        error_message: null,
        metadata: {},
        started_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        completed_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        created_at: new Date().toISOString(),
        created_by: 'system'
    },
    {
        id: 'job_2',
        feed_id: '2',
        job_type: 'full',
        status: 'failed',
        products_fetched: 5000,
        products_created: 10,
        products_updated: 0,
        products_failed: 4990,
        error_message: 'Connection timeout',
        metadata: {},
        started_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        completed_at: new Date(Date.now() - 1000 * 60 * 60 * 5 + 10000).toISOString(),
        created_at: new Date().toISOString(),
        created_by: 'system'
    },
    {
        id: 'job_3',
        feed_id: '4',
        job_type: 'pricing',
        status: 'running',
        products_fetched: 1000,
        products_created: 0,
        products_updated: 900,
        products_failed: 0,
        error_message: null,
        metadata: {},
        started_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
        created_by: 'admin'
    }
];
