/**
 * Broadcast Event Types
 *
 * Type definitions for Supabase Broadcast API events
 * sent between runners and the admin dashboard.
 */

import { z } from 'zod';

/**
 * Job assignment broadcast payload
 * Sent when a runner claims a job from the queue
 */
export interface JobAssignedPayload {
  /** The job that was assigned */
  job_id: string;
  /** Runner that claimed the job */
  runner_id: string;
  /** Human-readable runner name */
  runner_name: string;
  /** Scraper names assigned */
  scrapers: string[];
  /** Number of SKUs to process */
  skus_count: string;
  /** Timestamp of assignment */
  timestamp: string;
}

export const jobAssignedPayloadSchema = z.object({
  job_id: z.string(),
  runner_id: z.string(),
  runner_name: z.string(),
  scrapers: z.array(z.string()),
  skus_count: z.string(),
  timestamp: z.string(),
});

/**
 * Job progress update broadcast payload
 * Sent periodically during job execution
 */
export interface JobProgressPayload {
  /** The job being processed */
  job_id: string;
  /** Runner processing the job */
  runner_id: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current SKU being processed */
  current_sku?: string;
  /** Phase of execution */
  phase: 'initializing' | 'scraping' | 'processing' | 'uploading' | 'complete';
  /** Items processed so far */
  items_processed?: number;
  /** Total items expected */
  items_total?: number;
  /** Any error message if failed */
  error?: string;
  /** Timestamp of update */
  timestamp: string;
}

export const jobProgressPayloadSchema = z.object({
  job_id: z.string(),
  runner_id: z.string(),
  progress: z.number().min(0).max(100),
  current_sku: z.string().optional(),
  phase: z.enum(['initializing', 'scraping', 'processing', 'uploading', 'complete']),
  items_processed: z.number().optional(),
  items_total: z.number().optional(),
  error: z.string().optional(),
  timestamp: z.string(),
});

/**
 * Runner heartbeat broadcast payload
 * Sent periodically to indicate runner is alive
 */
export interface RunnerHeartbeatPayload {
  /** Runner identifier */
  runner_id: string;
  /** Human-readable runner name */
  runner_name: string;
  /** Current status */
  status: 'idle' | 'polling' | 'running' | 'busy';
  /** Number of active jobs */
  active_jobs: number;
  /** CPU usage percentage */
  cpu_percent?: number;
  /** Memory usage in MB */
  memory_mb?: number;
  /** Last job ID processed */
  last_job_id?: string;
  /** Timestamp of heartbeat */
  timestamp: string;
}

export const runnerHeartbeatPayloadSchema = z.object({
  runner_id: z.string(),
  runner_name: z.string(),
  status: z.enum(['idle', 'polling', 'running', 'busy']),
  active_jobs: z.number().int().min(0),
  cpu_percent: z.number().optional(),
  memory_mb: z.number().optional(),
  last_job_id: z.string().optional(),
  timestamp: z.string(),
});

/**
 * Runner log broadcast payload
 * Sent for significant log events during job execution
 */
export interface RunnerLogPayload {
  /** The job generating the log */
  job_id: string;
  /** Runner generating the log */
  runner_id: string;
  /** Log severity level */
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  /** Log message */
  message: string;
  /** Optional: source component */
  source?: string;
  /** Optional: related SKU */
  sku?: string;
  /** Optional: related selector */
  selector?: string;
  /** Timestamp of log */
  timestamp: string;
}

export const runnerLogPayloadSchema = z.object({
  job_id: z.string(),
  runner_id: z.string(),
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']),
  message: z.string(),
  source: z.string().optional(),
  sku: z.string().optional(),
  selector: z.string().optional(),
  timestamp: z.string(),
});

/**
 * Runner status change broadcast payload
 * Sent when runner status changes significantly
 */
export interface RunnerStatusPayload {
  /** Runner identifier */
  runner_id: string;
  /** Human-readable runner name */
  runner_name: string;
  /** New status */
  status: 'online' | 'offline' | 'error' | 'shutdown';
  /** Reason for status change */
  reason?: string;
  /** Last job ID processed */
  last_job_id?: string;
  /** Total jobs processed this session */
  jobs_processed?: number;
  /** Timestamp of change */
  timestamp: string;
}

export const runnerStatusPayloadSchema = z.object({
  runner_id: z.string(),
  runner_name: z.string(),
  status: z.enum(['online', 'offline', 'error', 'shutdown']),
  reason: z.string().optional(),
  last_job_id: z.string().optional(),
  jobs_processed: z.number().optional(),
  timestamp: z.string(),
});

/**
 * Union type for all broadcast event payloads
 */
export type BroadcastPayload =
  | JobAssignedPayload
  | JobProgressPayload
  | RunnerHeartbeatPayload
  | RunnerLogPayload
  | RunnerStatusPayload;

/**
 * Map of event names to payload types
 */
export interface BroadcastEventMap {
  /** Job assignment event */
  job_assigned: JobAssignedPayload;
  /** Job progress update */
  job_progress: JobProgressPayload;
  /** Runner heartbeat */
  runner_heartbeat: RunnerHeartbeatPayload;
  /** Runner log event */
  runner_log: RunnerLogPayload;
  /** Runner status change */
  runner_status: RunnerStatusPayload;
}
