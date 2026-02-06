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
  /** Optional metadata for runner configuration or capabilities */
  metadata?: Record<string, unknown>;
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
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Job assignment event from Postgres Changes.
 * Represents a scrape job assigned to a runner.
 */
export interface JobAssignment {
  /** Unique identifier for the assignment record */
  id: string;
  /** Reference to the scrape job being assigned */
  job_id: string;
  /** List of scraper names to execute */
  scrapers: string[];
  /** Target SKUs to scrape */
  skus: string[];
  /** Current status of the job assignment */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** ISO 8601 timestamp when the assignment was created */
  created_at: string;
  /** Optional runner ID once the job is picked up */
  runner_id?: string;
  /** Whether this is a test mode job */
  test_mode?: boolean;
}

/**
 * Zod schema for JobAssignment validation.
 */
export const jobAssignmentSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  scrapers: z.array(z.string()),
  skus: z.array(z.string()),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  created_at: z.string(),
  runner_id: z.string().optional(),
  test_mode: z.boolean().optional(),
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
  /** Reference to the parent job */
  job_id: string;
  /** ID of the runner that generated this log */
  runner_id: string;
  /** Log severity level */
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  /** Log message content */
  message: string;
  /** ISO 8601 timestamp when the log was created */
  timestamp: string;
}

/**
 * Zod schema for ScrapeJobLog validation.
 */
export const scrapeJobLogSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  runner_id: z.string(),
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']),
  message: z.string(),
  timestamp: z.string(),
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
