/**
 * Scraper Runs types - for viewing scrape job execution history
 */
import { z } from 'zod';

// Scraper run status enum (from database constraint)
export const scrapeJobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type ScrapeJobStatus = z.infer<typeof scrapeJobStatusSchema>;

// Extended statuses used in the UI
export type ScraperRunStatus = ScrapeJobStatus | 'claimed';

// Scraper run record from database (matches scrape_jobs table)
export interface ScraperRunRecord {
  id: string;
  scraper_name: string;
  status: string;
  skus: string[];
  total_skus: number;
  completed_skus: number;
  failed_skus: number;
  items_found: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  test_mode: boolean;
  lease_token?: string | null;
  lease_expires_at?: string | null;
  heartbeat_at?: string | null;
  attempt_count?: number;
  max_attempts?: number;
  backoff_until?: string | null;
  // Additional fields not in schema but computed
  github_run_id?: number | null;
  created_by?: string | null;
}

// API response type for runs list
export interface ScraperRunsResponse {
  runs: ScraperRunRecord[];
  totalCount: number;
}
