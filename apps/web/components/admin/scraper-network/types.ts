/**
 * Shared types for the Scraper Network dashboard.
 */

export type RunnerStatus = 'online' | 'offline' | 'busy' | 'idle' | 'polling' | 'paused';

export interface RunnerDetail {
  id: string;
  name: string;
  status: RunnerStatus;
  enabled: boolean;
  last_seen_at: string | null;
  active_jobs: number;
  region: string | null;
  version: string | null;
  build_check_reason: string | null;
  latest_build_sha?: string | null;
  latest_build_id?: string | null;
  metadata: Record<string, unknown> | null;
}

export interface RunnerScraperBreakdown {
  scraperName: string;
  runCount: number;
  successRate: number;
}

export interface RunnerStatisticsData {
  totalRuns: number;
  successRate: number;
  avgDuration: number;
  lastSeen: string;
  lastSeenRelative: string;
  uptimePercentage?: number;
  scraperBreakdown?: RunnerScraperBreakdown[];
}
