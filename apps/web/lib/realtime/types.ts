/**
 * BayState Realtime Types
 *
 * Type definitions for Supabase Realtime system used in the Admin Panel.
 * Covers runner presence, job assignments, broadcast events, and job logs.
 */

import { z } from 'zod';

/**
 * Runner presence state with metadata for tracking runner status.
 */
export interface RunnerPresence {
  /** Unique identifier for the runner instance */
  runner_id: string;
  /** Human-readable name of the runner */
  runner_name: string;
  /** Current operational status of the runner */
  status: 'online' | 'busy' | 'idle' | 'offline';
  /** Number of active jobs currently being processed */
  active_jobs: number;
  /** ISO 8601 timestamp of last activity */
  last_seen: string;
  /** Whether the runner is currently enabled to pick up new work */
  enabled?: boolean;
  /** Optional metadata for runner configuration or capabilities */
  metadata?: Record<string, unknown>;
  /** Optional runner version identifier */
  version?: string | null;
  /** Optional build compatibility status */
  build_check_reason?: string | null;
}

/**
 * Zod schema for RunnerPresence validation.
 */
export const runnerPresenceSchema = z.object({
  runner_id: z.string(),
  runner_name: z.string(),
  status: z.enum(['online', 'busy', 'idle', 'offline']),
  active_jobs: z.number().int().min(0),
  last_seen: z.string(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  version: z.string().nullable().optional(),
  build_check_reason: z.string().nullable().optional(),
});

/**
 * Job assignment event from Postgres Changes.
 * Represents a scrape job assigned to a runner.
 */
export interface JobAssignment {
  /** Unique identifier for the assignment record */
  id: string;
  /** Optional legacy reference to the scrape job being assigned */
  job_id?: string;
  /** List of scraper names to execute */
  scrapers: string[];
  /** Target SKUs to scrape */
  skus: string[];
  /** Current status of the job assignment */
  status: 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** ISO 8601 timestamp when the assignment was created */
  created_at: string;
  /** ISO 8601 timestamp when the assignment was last updated */
  updated_at?: string;
  /** Optional runner ID once the job is picked up */
  runner_id?: string;
  /** Human-readable runner name */
  runner_name?: string | null;
  /** Whether this is a test mode job */
  test_mode?: boolean;
  /** Latest job heartbeat timestamp */
  heartbeat_at?: string | null;
  /** Lease expiry timestamp for the active runner */
  lease_expires_at?: string | null;
  /** Durable runtime progress percent */
  progress_percent?: number | null;
  /** Durable runtime progress message */
  progress_message?: string | null;
  /** Durable runtime progress phase */
  progress_phase?: string | null;
  /** Durable runtime progress details */
  progress_details?: Record<string, unknown> | null;
  /** Durable runtime progress update timestamp */
  progress_updated_at?: string | null;
  /** Currently processed SKU */
  current_sku?: string | null;
  /** Processed item count */
  items_processed?: number | null;
  /** Total item count */
  items_total?: number | null;
  /** Latest runtime event timestamp */
  last_event_at?: string | null;
  /** Latest persisted log timestamp */
  last_log_at?: string | null;
  /** Latest persisted log level */
  last_log_level?: string | null;
  /** Latest persisted log message */
  last_log_message?: string | null;
}

/**
 * Zod schema for JobAssignment validation.
 */
export const jobAssignmentSchema = z.object({
  id: z.string(),
  job_id: z.string().optional(),
  scrapers: z.array(z.string()),
  skus: z.array(z.string()),
  status: z.enum(['pending', 'claimed', 'running', 'completed', 'failed', 'cancelled']),
  created_at: z.string(),
  runner_id: z.string().optional(),
  runner_name: z.string().nullable().optional(),
  test_mode: z.boolean().optional(),
  updated_at: z.string().optional(),
  heartbeat_at: z.string().nullable().optional(),
  lease_expires_at: z.string().nullable().optional(),
  progress_percent: z.number().nullable().optional(),
  progress_message: z.string().nullable().optional(),
  progress_phase: z.string().nullable().optional(),
  progress_details: z.record(z.string(), z.unknown()).nullable().optional(),
  progress_updated_at: z.string().nullable().optional(),
  current_sku: z.string().nullable().optional(),
  items_processed: z.number().nullable().optional(),
  items_total: z.number().nullable().optional(),
  last_event_at: z.string().nullable().optional(),
  last_log_at: z.string().nullable().optional(),
  last_log_level: z.string().nullable().optional(),
  last_log_message: z.string().nullable().optional(),
});

/**
 * Generic broadcast event structure for realtime communication.
 * Used for sending arbitrary messages between runners and the admin panel.
 */
export interface BroadcastEvent<T = unknown> {
  /** Event type identifier for routing and handling */
  event: string;
  /** Event payload data */
  payload: T;
  /** ISO 8601 timestamp when the event was created */
  timestamp: string;
  /** ID of the runner that sent the event */
  runner_id: string;
}

/**
 * Zod schema for BroadcastEvent validation.
 */
export const broadcastEventSchema = z.object({
  event: z.string(),
  payload: z.unknown(),
  timestamp: z.string(),
  runner_id: z.string(),
});

/**
 * Scrape job log event from runners.
 * Structured logging for tracking job execution progress and errors.
 */
export interface ScrapeJobLog {
  /** Unique identifier for the log entry */
  id: string;
  /** Stable runner-generated event identifier */
  event_id?: string;
  /** Reference to the parent job */
  job_id: string;
  /** ID of the runner that generated this log */
  runner_id?: string;
  /** Human-readable runner name */
  runner_name?: string;
  /** Log severity level */
  level: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  /** Log message content */
  message: string;
  /** ISO 8601 timestamp when the log was created */
  timestamp: string;
  /** Optional logical source/logger name */
  source?: string;
  /** Optional scraper slug */
  scraper_name?: string;
  /** Optional active SKU */
  sku?: string;
  /** Optional execution phase */
  phase?: string;
  /** Optional per-job sequence number */
  sequence?: number;
  /** Optional JSON payload with additional context (e.g. product data) */
  details?: Record<string, unknown>;
}

/**
 * Zod schema for ScrapeJobLog validation.
 */
export const scrapeJobLogSchema = z.object({
  id: z.string(),
  event_id: z.string().optional(),
  job_id: z.string(),
  runner_id: z.string().optional(),
  runner_name: z.string().optional(),
  level: z.enum(['debug', 'info', 'warning', 'error', 'critical']),
  message: z.string(),
  timestamp: z.string(),
  source: z.string().optional(),
  scraper_name: z.string().optional(),
  sku: z.string().optional(),
  phase: z.string().optional(),
  sequence: z.number().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Union type for all realtime event payloads.
 */
export type RealtimeEventPayload =
  | RunnerPresence
  | JobAssignment
  | BroadcastEvent
  | ScrapeJobLog;

/**
 * Union type for all realtime event schemas.
 */
export type RealtimeEventSchema =
  | typeof runnerPresenceSchema
  | typeof jobAssignmentSchema
  | typeof broadcastEventSchema
  | typeof scrapeJobLogSchema;
