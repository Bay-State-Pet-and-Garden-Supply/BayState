/**
 * useJobSubscription - Supabase Postgres Changes hook for subscribing to scrape_jobs table
 *
 * This hook subscribes to INSERT, UPDATE, and DELETE events on the scrape_jobs table.
 * Used for real-time tracking of job creation, assignment, and completion.
 */

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeChannel } from './useRealtimeChannel';
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
  /** Optional custom channel name for job subscriptions */
  channelName?: string;
  /** Whether to automatically connect on mount (default: true) */
  autoConnect?: boolean;
  /** Filter by specific job ids */
  jobIds?: string[];
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

type JobEventType = 'INSERT' | 'UPDATE' | 'DELETE';
type JobRealtimePayload = RealtimePostgresChangesPayload<JobAssignment>;
type JobBuckets = JobSubscriptionState['jobs'];
type JobCounts = JobSubscriptionState['counts'];
type JobSubscriptionData = Omit<JobSubscriptionState, 'isConnected' | 'error'>;

interface SharedJobChannelEntry {
  channel: RealtimeChannel;
  listeners: Set<(payload: JobRealtimePayload) => void>;
}

const sharedJobChannels = new Map<string, SharedJobChannelEntry>();

function createEmptyJobs(): JobBuckets {
  return {
    pending: [],
    running: [],
    completed: [],
    failed: [],
    cancelled: [],
  };
}

function createInitialDataState(): JobSubscriptionData {
  return {
    jobs: createEmptyJobs(),
    latestJob: null,
    counts: {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
    },
  };
}

function calculateCounts(jobs: JobBuckets): JobCounts {
  const pending = jobs.pending.length;
  const running = jobs.running.length;
  const completed = jobs.completed.length;
  const failed = jobs.failed.length;
  const cancelled = jobs.cancelled.length;

  return {
    pending,
    running,
    completed,
    failed,
    cancelled,
    total: pending + running + completed + failed + cancelled,
  };
}

function getLatestJob(jobs: JobBuckets): JobAssignment | null {
  const allJobs = [...jobs.pending, ...jobs.running, ...jobs.completed, ...jobs.failed, ...jobs.cancelled];

  if (allJobs.length === 0) {
    return null;
  }

  return [...allJobs].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  })[0];
}

function ensureSharedJobChannel(channelName: string): SharedJobChannelEntry {
  const channel = createClient().channel(channelName);
  const existingEntry = sharedJobChannels.get(channelName);

  if (existingEntry && existingEntry.channel === channel) {
    return existingEntry;
  }

  const entry: SharedJobChannelEntry = {
    channel,
    listeners: existingEntry?.listeners ?? new Set(),
  };

  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'scrape_jobs',
    },
    (payload) => {
      for (const listener of Array.from(entry.listeners)) {
        listener(payload as JobRealtimePayload);
      }
    }
  );

  sharedJobChannels.set(channelName, entry);
  return entry;
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
    channelName: providedChannelName,
    autoConnect = true,
    jobIds,
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

  const channelName = useMemo(() => providedChannelName ?? 'scrape-jobs', [providedChannelName]);
  const [dataState, setDataState] = useState<JobSubscriptionData>(() => createInitialDataState());
  const activeRef = useRef(autoConnect);
  const callbacksRef = useRef({ onJobCreated, onJobUpdated, onJobDeleted });
  const subscriptionConfigRef = useRef({
    jobIds,
    scraperNames,
    testModeOnly,
    includeInsert,
    includeUpdate,
    includeDelete,
    maxJobsPerStatus,
  });
  const queryFiltersRef = useRef({ jobIds, scraperNames, testModeOnly });

  useEffect(() => {
    callbacksRef.current = { onJobCreated, onJobUpdated, onJobDeleted };
  }, [onJobCreated, onJobUpdated, onJobDeleted]);

  useEffect(() => {
    subscriptionConfigRef.current = {
      jobIds,
      scraperNames,
      testModeOnly,
      includeInsert,
      includeUpdate,
      includeDelete,
      maxJobsPerStatus,
    };
  }, [jobIds, scraperNames, testModeOnly, includeInsert, includeUpdate, includeDelete, maxJobsPerStatus]);

  useEffect(() => {
    queryFiltersRef.current = { jobIds, scraperNames, testModeOnly };
  }, [jobIds, scraperNames, testModeOnly]);

  useEffect(() => {
    activeRef.current = autoConnect;
  }, [autoConnect]);

  const normalizeStatus = useCallback(
    (status: string | undefined): keyof JobSubscriptionState['jobs'] => {
      if (status === 'claimed') {
        return 'running';
      }

      if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'running') {
        return status;
      }

      return 'pending';
    },
    []
  );

  const getSupabase = useCallback(() => createClient(), []);

  const processJobChange = useCallback(
    (eventType: JobEventType, payload: JobRealtimePayload) => {
      if (!activeRef.current) {
        return;
      }

      const job = payload.new as JobAssignment | null;
      const oldJob = payload.old as JobAssignment | null;

      if (!job && !oldJob) {
        return;
      }

      const { onJobCreated, onJobUpdated, onJobDeleted } = callbacksRef.current;
      const { maxJobsPerStatus } = subscriptionConfigRef.current;

      setDataState((previousState) => {
        const nextJobs: JobBuckets = {
          pending: [...previousState.jobs.pending],
          running: [...previousState.jobs.running],
          completed: [...previousState.jobs.completed],
          failed: [...previousState.jobs.failed],
          cancelled: [...previousState.jobs.cancelled],
        };

        if (eventType === 'DELETE' && oldJob) {
          nextJobs.pending = nextJobs.pending.filter((candidate) => candidate.id !== oldJob.id);
          nextJobs.running = nextJobs.running.filter((candidate) => candidate.id !== oldJob.id);
          nextJobs.completed = nextJobs.completed.filter((candidate) => candidate.id !== oldJob.id);
          nextJobs.failed = nextJobs.failed.filter((candidate) => candidate.id !== oldJob.id);
          nextJobs.cancelled = nextJobs.cancelled.filter((candidate) => candidate.id !== oldJob.id);
        } else if (job) {
          nextJobs.pending = nextJobs.pending.filter((candidate) => candidate.id !== job.id);
          nextJobs.running = nextJobs.running.filter((candidate) => candidate.id !== job.id);
          nextJobs.completed = nextJobs.completed.filter((candidate) => candidate.id !== job.id);
          nextJobs.failed = nextJobs.failed.filter((candidate) => candidate.id !== job.id);
          nextJobs.cancelled = nextJobs.cancelled.filter((candidate) => candidate.id !== job.id);

          const normalizedStatus = normalizeStatus(job.status);
          nextJobs[normalizedStatus] = [job, ...nextJobs[normalizedStatus]].slice(0, maxJobsPerStatus);
        }

        return {
          jobs: nextJobs,
          counts: calculateCounts(nextJobs),
          latestJob: getLatestJob(nextJobs),
        };
      });

      if (eventType === 'DELETE' && oldJob) {
        onJobDeleted?.(oldJob.id);
        return;
      }

      if (!job) {
        return;
      }

      if (eventType === 'INSERT') {
        onJobCreated?.(job);
      } else if (eventType === 'UPDATE') {
        onJobUpdated?.(job);
      }
    },
    [normalizeStatus]
  );

  const handleRealtimePayload = useCallback(
    (payload: JobRealtimePayload) => {
      if (!activeRef.current) {
        return;
      }

      const {
        jobIds,
        scraperNames,
        testModeOnly,
        includeInsert,
        includeUpdate,
        includeDelete,
      } = subscriptionConfigRef.current;

      const eventType = payload.eventType as JobEventType;
      const candidate = ((payload.new as JobAssignment | null) || (payload.old as JobAssignment | null)) as JobAssignment | null;

      if (candidate && jobIds && jobIds.length > 0 && !jobIds.includes(candidate.id)) {
        return;
      }

      if (candidate && scraperNames && scraperNames.length > 0) {
        const hasMatchingScraper = scraperNames.some((name) => (candidate.scrapers || []).includes(name));
        if (!hasMatchingScraper) {
          return;
        }
      }

      if (candidate && testModeOnly && !candidate.test_mode) {
        return;
      }

      if (
        (eventType === 'INSERT' && includeInsert) ||
        (eventType === 'UPDATE' && includeUpdate) ||
        (eventType === 'DELETE' && includeDelete)
      ) {
        processJobChange(eventType, payload);
      }
    },
    [processJobChange]
  );

  useEffect(() => {
    const sharedChannel = ensureSharedJobChannel(channelName);
    sharedChannel.listeners.add(handleRealtimePayload);

    return () => {
      sharedChannel.listeners.delete(handleRealtimePayload);

      if (sharedChannel.listeners.size === 0 && sharedJobChannels.get(channelName) === sharedChannel) {
        sharedJobChannels.delete(channelName);
      }
    };
  }, [channelName, handleRealtimePayload]);

  const {
    connectionState,
    lastError,
    connect: connectRealtimeChannel,
    disconnect: disconnectRealtimeChannel,
  } = useRealtimeChannel({
    channelName,
    autoConnect,
    onMessage: (payload) => {
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'eventType' in payload &&
        'new' in payload &&
        'old' in payload
      ) {
        handleRealtimePayload(payload as JobRealtimePayload);
      }
    },
    onError: () => {
      // Error handling delegated to useRealtimeChannel state
    },
  });

  const connect = useCallback(() => {
    ensureSharedJobChannel(channelName);
    activeRef.current = true;
    connectRealtimeChannel();
  }, [channelName, connectRealtimeChannel]);

  const disconnect = useCallback(() => {
    activeRef.current = false;
    disconnectRealtimeChannel();
  }, [disconnectRealtimeChannel]);

  /**
   * Refetch jobs from the database
   */
  const refetch = useCallback(async () => {
    const supabase = getSupabase();
    const { jobIds, scraperNames, testModeOnly } = queryFiltersRef.current;

    try {
      let query = supabase
        .from('scrape_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (jobIds && jobIds.length > 0) {
        query = query.in('id', jobIds);
      }

      if (scraperNames && scraperNames.length > 0) {
        query = query.in('scrapers', scraperNames);
      }

      if (testModeOnly) {
        query = query.eq('test_mode', true);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const nextJobs = createEmptyJobs();

      (data || []).forEach((job) => {
        const normalizedStatus = normalizeStatus(job.status as string);
        nextJobs[normalizedStatus].push(job as JobAssignment);
      });

      setDataState({
        jobs: nextJobs,
        counts: calculateCounts(nextJobs),
        latestJob: getLatestJob(nextJobs),
      });
    } catch {
      // Error handling via refetch return value
    }
  }, [getSupabase, normalizeStatus]);

  /**
   * Get a specific job by ID
   */
  const getJob = useCallback(
    (jobId: string): JobAssignment | undefined => {
      return (
        dataState.jobs.pending.find((job) => job.id === jobId) ||
        dataState.jobs.running.find((job) => job.id === jobId) ||
        dataState.jobs.completed.find((job) => job.id === jobId) ||
        dataState.jobs.failed.find((job) => job.id === jobId) ||
        dataState.jobs.cancelled.find((job) => job.id === jobId)
      );
    },
    [dataState.jobs]
  );

  /**
   * Get jobs for a specific runner
   */
  const getJobsForRunner = useCallback(
    (runnerId: string): JobAssignment[] => {
      return [
        ...dataState.jobs.pending,
        ...dataState.jobs.running,
        ...dataState.jobs.completed,
        ...dataState.jobs.failed,
        ...dataState.jobs.cancelled,
      ].filter((job) => job.runner_id === runnerId);
    },
    [dataState.jobs]
  );

  useEffect(() => {
    if (autoConnect) {
      void refetch();
    }
  }, [autoConnect, refetch]);

  const isConnected = connectionState === 'connected';
  const error = lastError;

  return useMemo(
    () => ({
      ...dataState,
      isConnected,
      error,
      connect,
      disconnect,
      refetch,
      getJob,
      getJobsForRunner,
    }),
    [dataState, isConnected, error, connect, disconnect, refetch, getJob, getJobsForRunner]
  );
}
