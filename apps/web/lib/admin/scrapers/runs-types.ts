/**
 * Scraper Runs types - for viewing enrichment job execution history
 * (Formerly scrape_jobs in the legacy architecture)
 */
import { z } from 'zod';

// Enrichment job status enum (from database constraint)
const enrichmentJobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']);
type EnrichmentJobStatus = z.infer<typeof enrichmentJobStatusSchema>;

// Scraper run record from database (matches enrichment_jobs table)
export interface ScraperRunRecord {
  id: string;
  status: string; // From EnrichmentJobStatus
  skus: string[];
  total_count: number;
  completed_count: number;
  failed_count: number;
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
  claimed_by?: string | null;
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
  // Metadata/Config context
  config?: Record<string, any>;
  test_metadata?: Record<string, any>;
  // Additional fields for UI compatibility
  scraper_name?: string;
  created_by?: string | null;
}

// Scraper run attempt (replaces chunks in unified architecture)
export interface ScraperRunAttempt {
  id: string;
  job_id: string;
  sku: string;
  attempt_number: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  confidence_overall?: number | null;
  result?: any;
}

// API response type for runs list
export interface ScraperRunsResponse {
  runs: ScraperRunRecord[];
  totalCount: number;
}
