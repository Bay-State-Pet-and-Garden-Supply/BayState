/**
 * useJobSubscription - Supabase Postgres Changes hook for subscribing to scrape_jobs table
 *
 * This hook subscribes to INSERT, UPDATE, and DELETE events on the scrape_jobs table.
 * Used for real-time tracking of job creation, assignment, and completion.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { JobAssignment } from './types';

/**
 * Job subscription state
 */
export interface JobSubscriptionState {
  /** All jobs organized by status */
  jobs: {
    pending: JobAssignment[];
    running: JobAssignment[];
    completed: JobAssignment[];
    failed: JobAssignment[];
    cancelled: JobAssignment[];
  };
  /** Most recent job (by created_at) */
  latestJob: JobAssignment | null;
  /** Count of jobs by status */
  counts: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
  };
  /** Whether the subscription is connected */
  isConnected: boolean;
  /** Connection error if any */
  error: Error | null;
}

/**
 * Configuration options for the job subscription hook
 */
export interface UseJobSubscriptionOptions {
  /** Channel name for job subscriptions (default: 'scrape-jobs-subscription') */
  channelName?: string;
  /** Whether to automatically connect on mount (default: true) */
  autoConnect?: boolean;
  /** Filter by specific scraper names */
  scraperNames?: string[];
  /** Filter by test mode jobs only */
  testModeOnly?: boolean;
  /** Maximum jobs to keep per status (default: 50) */
  maxJobsPerStatus?: number;
  /** Callback when a new job is created (INSERT) */
  onJobCreated?: (job: JobAssignment) => void;
  /** Callback when a job is updated */
  onJobUpdated?: (job: JobAssignment) => void;
  /** Callback when a job is deleted */
  onJobDeleted?: (jobId: string) => void;
}

/**
 * Event type filters
 */
export interface JobEventFilters {
  /** Subscribe to INSERT events (new jobs) */
  includeInsert?: boolean;
  /** Subscribe to UPDATE events (status changes) */
  includeUpdate?: boolean;
  /** Subscribe to DELETE events */
  includeDelete?: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Partial<UseJobSubscriptionOptions> = {
  channelName: 'scrape-jobs-subscription',
  autoConnect: true,
  maxJobsPerStatus: 50,
};

/**
 * Hook return type
 */
export interface UseJobSubscriptionReturn extends JobSubscriptionState {
  /** Connect to the job subscription channel */
  connect: () => void;
  /** Disconnect from the job subscription channel */
  disconnect: () => void;
  /** Manually trigger a refetch (re-queries the database) */
  refetch: () => Promise<void>;
  /** Get a specific job by ID */
  getJob: (jobId: string) => JobAssignment | undefined;
  /** Get jobs for a specific runner */
  getJobsForRunner: (runnerId: string) => JobAssignment[];
}

/**
 * useJobSubscription - Hook for subscribing to scrape_jobs table changes
 *
 * @example
 * ```typescript
 * const {
 *   jobs,
 *   counts,
 *   isConnected,
 *   connect,
 *   disconnect,
 * } = useJobSubscription({
 *   scraperNames: ['petco', 'chewy'],
 *   onJobCreated: (job) => console.log(`New job: ${job.id}`),
 *   onJobUpdated: (job) => console.log(`Job ${job.id} status: ${job.status}`),
 * });
 * ```
 */
export function useJobSubscription(
  options: UseJobSubscriptionOptions = {},
  filters: JobEventFilters = {}
): UseJobSubscriptionReturn {
  const {
    channelName = 'scrape-jobs-subscription',
    autoConnect = true,
    scraperNames,
    testModeOnly,
    maxJobsPerStatus = 50,
    onJobCreated,
    onJobUpdated,
    onJobDeleted,
  } = { ...DEFAULT_OPTIONS, ...options };

  const {
    includeInsert = true,
    includeUpdate = true,
    includeDelete = false,
  } = filters;

  const [state, setState] = useState<JobSubscriptionState>({
    jobs: {
      pending: [],
      running: [],
      completed: [],
      failed: [],
      cancelled: [],
    },
    latestJob: null,
    counts: {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
    },
    isConnected: false,
    error: null,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  /**
   * Get the Supabase client (lazy initialization)
   */
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

  /**
   * Build the filter string for the subscription
   */
  const buildFilter = useCallback((): string => {
    const filters: string[] = [];

    if (scraperNames && scraperNames.length > 0) {
      // Filter by first scraper name (simplified)
      filters.push(`scrapers=cs.{${scraperNames.join(',')}}`);
    }

    if (testModeOnly) {
      filters.push('test_mode=eq.true');
    }

    return filters.join('&');
  }, [scraperNames, testModeOnly]);

  /**
   * Process an incoming job change event
   */
  const processJobChange = useCallback(
    (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: RealtimePostgresChangesPayload<JobAssignment>
    ) => {
      const job = payload.new as JobAssignment | null;
      const oldJob = payload.old as JobAssignment | null;

      if (!job && !oldJob) return;

      setState((prev) => {
        const newJobs = { ...prev.jobs };
        const allJobs: JobAssignment[] = [];

        // Collect all existing jobs
        Object.values(newJobs).forEach((jobs) => {
          allJobs.push(...jobs);
        });

        if (eventType === 'DELETE' && oldJob) {
          // Remove deleted job from all status arrays
          Object.keys(newJobs).forEach((status) => {
            newJobs[status as keyof typeof newJobs] = newJobs[
              status as keyof typeof newJobs
            ].filter((j) => j.id !== oldJob.id);
          });
          onJobDeleted?.(oldJob.id);
        } else if (job) {
          // Determine job status
          const status = job.status as keyof typeof newJobs;

          // Check if job already exists (UPDATE case)
          const existingIndex = allJobs.findIndex((j) => j.id === job.id);

          if (existingIndex >= 0) {
            // UPDATE: Move job to new status array
            Object.keys(newJobs).forEach((s) => {
              newJobs[s as keyof typeof newJobs] = newJobs[s as keyof typeof newJobs].filter(
                (j) => j.id !== job.id
              );
            });
          }

          // Add to appropriate status array
          if (newJobs[status]) {
            newJobs[status as keyof typeof newJobs] = [
              job,
              ...newJobs[status as keyof typeof newJobs],
            ].slice(0, maxJobsPerStatus);
          }

          if (eventType === 'INSERT') {
            onJobCreated?.(job);
          } else if (eventType === 'UPDATE') {
            onJobUpdated?.(job);
          }
        }

        // Calculate counts
        const counts = {
          pending: newJobs.pending.length,
          running: newJobs.running.length,
          completed: newJobs.completed.length,
          failed: newJobs.failed.length,
          cancelled: newJobs.cancelled.length,
          total:
            newJobs.pending.length +
            newJobs.running.length +
            newJobs.completed.length +
            newJobs.failed.length +
            newJobs.cancelled.length,
        };

        // Find latest job
        const latestJob =
          allJobs.length > 0
            ? allJobs.sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )[0]
            : null;

        return {
          ...prev,
          jobs: newJobs,
          counts,
          latestJob,
        };
      });
    },
    [maxJobsPerStatus, onJobCreated, onJobUpdated, onJobDeleted]
  );

  /**
   * Connect to the job subscription channel
   */
  const connect = useCallback(() => {
    const supabase = getSupabase();

    // Don't create duplicate channels
    if (channelRef.current) {
      return;
    }

    try {
      const channel = supabase.channel(channelName, {
        config: {
          schema: 'public',
          table: 'scrape_jobs',
          filter: buildFilter() || undefined,
        },
      });

      // Subscribe to INSERT events
      if (includeInsert) {
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'scrape_jobs',
            filter: buildFilter() || undefined,
          },
          (payload) => processJobChange('INSERT', payload)
        );
      }

      // Subscribe to UPDATE events
      if (includeUpdate) {
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'scrape_jobs',
            filter: buildFilter() || undefined,
          },
          (payload) => processJobChange('UPDATE', payload)
        );
      }

      // Subscribe to DELETE events
      if (includeDelete) {
        channel.on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'scrape_jobs',
            filter: buildFilter() || undefined,
          },
          (payload) => processJobChange('DELETE', payload)
        );
      }

      channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setState((prev) => ({ ...prev, isConnected: true, error: null }));
          console.log('[useJobSubscription] Connected to job subscription');
        } else if (status === 'CHANNEL_ERROR') {
          const error = new Error(`Job subscription channel error: ${err?.message || 'unknown'}`);
          console.error('[useJobSubscription] Channel error:', error, { err });
          setState((prev) => ({ ...prev, error, isConnected: false }));
        }
      });

      channelRef.current = channel;
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      console.error('[useJobSubscription] Connection error:', error);
      setState((prev) => ({ ...prev, error, isConnected: false }));
    }
  }, [channelName, getSupabase, buildFilter, includeInsert, includeUpdate, includeDelete, processJobChange]);

  /**
   * Disconnect from the job subscription channel
   */
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      const supabase = getSupabase();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
    }));
  }, [getSupabase]);

  /**
   * Refetch jobs from the database
   */
  const refetch = useCallback(async () => {
    const supabase = getSupabase();

    try {
      let query = supabase
        .from('scrape_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (scraperNames && scraperNames.length > 0) {
        query = query.in('scrapers', scraperNames);
      }

      if (testModeOnly) {
        query = query.eq('test_mode', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      const jobs: JobSubscriptionState['jobs'] = {
        pending: [],
        running: [],
        completed: [],
        failed: [],
        cancelled: [],
      };

      (data || []).forEach((job) => {
        const status = (job.status as string) || 'pending';
        if (jobs[status as keyof typeof jobs]) {
          jobs[status as keyof typeof jobs].push(job as JobAssignment);
        }
      });

      const counts = {
        pending: jobs.pending.length,
        running: jobs.running.length,
        completed: jobs.completed.length,
        failed: jobs.failed.length,
        cancelled: jobs.cancelled.length,
        total: data?.length || 0,
      };

      const latestJob = data?.[0] ? (data[0] as JobAssignment) : null;

      setState((prev) => ({
        ...prev,
        jobs,
        counts,
        latestJob,
        error: null,
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to refetch jobs');
      console.error('[useJobSubscription] Refetch error:', error);
      setState((prev) => ({ ...prev, error }));
    }
  }, [getSupabase, scraperNames, testModeOnly]);

  /**
   * Get a specific job by ID
   */
  const getJob = useCallback(
    (jobId: string): JobAssignment | undefined => {
      return (
        state.jobs.pending.find((j) => j.id === jobId) ||
        state.jobs.running.find((j) => j.id === jobId) ||
        state.jobs.completed.find((j) => j.id === jobId) ||
        state.jobs.failed.find((j) => j.id === jobId) ||
        state.jobs.cancelled.find((j) => j.id === jobId)
      );
    },
    [state.jobs]
  );

  /**
   * Get jobs for a specific runner
   */
  const getJobsForRunner = useCallback(
    (runnerId: string): JobAssignment[] => {
      const allJobs: JobAssignment[] = [];
      Object.values(state.jobs).forEach((jobs) => {
        allJobs.push(...jobs);
      });
      return allJobs.filter((job) => job.runner_id === runnerId);
    },
    [state.jobs]
  );

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    refetch,
    getJob,
    getJobsForRunner,
  };
}
