/**
 * Scraper Runs types - for viewing scrape job execution history
 */
import { z } from 'zod';

// Scraper run status enum (from database constraint)
export const scrapeJobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type ScrapeJobStatus = z.infer<typeof scrapeJobStatusSchema>;

export const scrapeJobChunkStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type ScrapeJobChunkStatus = z.infer<typeof scrapeJobChunkStatusSchema>;

// Extended statuses used in the UI
export type ScraperRunStatus = ScrapeJobStatus | 'claimed';

// Scraper run chunk record from database (matches scrape_job_chunks table)
export interface ScraperRunChunk {
  id: string;
  job_id: string;
  chunk_index: number;
  status: ScrapeJobChunkStatus;
  scrapers: string[];
  skus: string[];
  runner_id: string | null;
  claimed_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
  error_message: string | null;
  work_units_processed: number;
  planned_work_units: number;
  created_at: string;
  updated_at: string;
}

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
  runner_name?: string | null;
  progress_percent?: number | null;
  progress_message?: string | null;
  progress_phase?: string | null;
  progress_updated_at?: string | null;
  current_sku?: string | null;
  items_processed?: number | null;
  items_total?: number | null;
  last_event_at?: string | null;
  last_log_at?: string | null;
  last_log_level?: string | null;
  last_log_message?: string | null;
  // Additional fields not in schema but computed
  github_run_id?: number | null;
  created_by?: string | null;
}

// API response type for runs list
export interface ScraperRunsResponse {
  runs: ScraperRunRecord[];
  totalCount: number;
}
