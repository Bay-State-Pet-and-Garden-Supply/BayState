/**
 * ScraperNetworkDashboard - Real-time scraper runner network dashboard
 *
 * A comprehensive real-time dashboard for monitoring scraper runners,
 * job distribution, and system health using Supabase Realtime.
 *
 * Replaces the polling-based RunnerGrid and RunnerAccounts components
 * with live Presence, Broadcast, and Postgres Changes subscriptions.
 */

'use client';

import { useState, useCallback } from 'react';
import { Metadata } from 'next';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Network, LayoutDashboard, List, Activity, Settings } from 'lucide-react';

import { PresenceStats } from '@/components/admin/scraper-network/presence-stats';
import { PresenceGrid } from '@/components/admin/scraper-network/presence-grid';
import { DistributionStats } from '@/components/admin/scraper-network/distribution-stats';
import { JobHeatmap } from '@/components/admin/scraper-network/job-heatmap';
import { JobAssignmentFeed } from '@/components/admin/scraper-network/job-assignment-feed';
import { LogBroadcastPanel } from '@/components/admin/scraper-network/log-broadcast-panel';
import { JobProgressIndicator } from '@/components/admin/scraper-network/job-progress-indicator';

import type { RunnerPresence, JobAssignment, ScrapeJobLog } from '@/lib/realtime';

export const metadata: Metadata = {
  title: 'Scraper Network | Admin',
  description: 'Real-time monitoring of your distributed scraper fleet',
};

type ViewMode = 'dashboard' | 'jobs' | 'logs' | 'activity';

const navVariants = cva(
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
  {
    variants: {
      active: {
        true: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        false:
          'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
      },
    },
  }
);

interface ScraperNetworkDashboardProps {
  /** Initial runners to show before connection */
  initialRunners?: RunnerPresence[];
  /** Default view mode */
  defaultView?: ViewMode;
}

/**
 * ScraperNetworkDashboard Component
 *
 * A real-time dashboard combining:
 * - PresenceStats: Runner status summary
 * - PresenceGrid: Runner presence cards with filtering
 * - DistributionStats: Job distribution overview
 * - JobHeatmap: Runner-job matrix
 * - JobAssignmentFeed: Live job feed
 * - LogBroadcastPanel: Real-time logs from runners
 * - JobProgressIndicator: Progress bars for running jobs
 *
 * @example
 * ```tsx
 * <ScraperNetworkDashboard />
 * ```
 */
export function ScraperNetworkDashboard({
  initialRunners = [],
  defaultView = 'dashboard',
}: ScraperNetworkDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [selectedRunner, setSelectedRunner] = useState<RunnerPresence | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobAssignment | null>(null);

  // Handlers
  const handleRunnerClick = useCallback((runner: RunnerPresence) => {
    setSelectedRunner(runner);
    setViewMode('jobs');
  }, []);

  const handleJobClick = useCallback((job: JobAssignment) => {
    setSelectedJob(job);
  }, []);

  const handleLogClick = useCallback((log: ScrapeJobLog) => {
    console.log('Log clicked:', log);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
          <Network className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Scraper Network
          </h1>
          <p className="text-sm text-slate-500">
            Real-time monitoring of your distributed scraper fleet
          </p>
        </div>
      </div>

      {/* View Navigation */}
      <div className="flex items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setViewMode('dashboard')}
          className={cn(navVariants({ active: viewMode === 'dashboard' }))}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </button>
        <button
          onClick={() => setViewMode('jobs')}
          className={cn(navVariants({ active: viewMode === 'jobs' }))}
        >
          <List className="h-4 w-4" />
          Jobs
        </button>
        <button
          onClick={() => setViewMode('logs')}
          className={cn(navVariants({ active: viewMode === 'logs' }))}
        >
          <Activity className="h-4 w-4" />
          Logs
        </button>
        <button
          onClick={() => setViewMode('activity')}
          className={cn(navVariants({ active: viewMode === 'activity' }))}
        >
          <Settings className="h-4 w-4" />
          Activity
        </button>
      </div>

      {/* Dashboard View */}
      {viewMode === 'dashboard' && (
        <div className="space-y-6">
          {/* Top Stats Row */}
          <div className="grid gap-4 md:grid-cols-2">
            <PresenceStats
              detailed={true}
              onViewAll={() => setViewMode('dashboard')}
            />
            <DistributionStats
              detailed={true}
              onViewAll={() => setViewMode('jobs')}
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: Presence Grid */}
            <div className="lg:col-span-2">
              <PresenceGrid
                initialRunners={initialRunners}
                compact={false}
                searchable={true}
                filterable={true}
                onRunnerClick={handleRunnerClick}
                onCountChange={(counts) => {
                  console.log('Runner counts changed:', counts);
                }}
              />
            </div>

            {/* Right: Job Progress */}
            <div>
              <JobProgressIndicator
                showProgress={true}
                showElapsed={true}
                maxItems={5}
                onJobClick={handleJobClick}
              />
            </div>
          </div>

          {/* Job Heatmap */}
          <JobHeatmap
            maxJobsPerRunner={5}
            maxRunners={10}
            onCellClick={(job, runner) => {
              setSelectedJob(job);
              if (runner) setSelectedRunner(runner);
            }}
          />
        </div>
      )}

      {/* Jobs View */}
      {viewMode === 'jobs' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Job Feed */}
          <div className="lg:col-span-2">
            <JobAssignmentFeed
              statusFilter={['pending', 'running']}
              onJobClick={handleJobClick}
              showTimestamp={true}
            />
          </div>

          {/* Right: Job Details */}
          <div className="space-y-6">
            <DistributionStats detailed={false} />
            {selectedJob && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  Selected Job
                </h3>
                <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg overflow-auto">
                  {JSON.stringify(selectedJob, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logs View */}
      {viewMode === 'logs' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Live Logs */}
          <div>
            <LogBroadcastPanel
              maxLogs={100}
              compact={false}
              onLogClick={handleLogClick}
            />
          </div>

          {/* Right: Job Progress */}
          <div>
            <JobProgressIndicator
              showProgress={true}
              showElapsed={true}
              maxItems={10}
              onJobClick={handleJobClick}
            />
          </div>
        </div>
      )}

      {/* Activity View */}
      {viewMode === 'activity' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Job Feed (All) */}
          <JobAssignmentFeed
            statusFilter={undefined}
            maxItems={50}
            onJobClick={handleJobClick}
            showTimestamp={true}
          />

          {/* Right: Presence Grid */}
          <PresenceGrid
            initialRunners={initialRunners}
            compact={true}
            searchable={true}
            filterable={true}
            onRunnerClick={handleRunnerClick}
          />
        </div>
      )}
    </div>
  );
}

export default ScraperNetworkDashboard;
