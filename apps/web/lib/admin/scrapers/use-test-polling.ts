'use client';

import { useState, useEffect, useRef, useCallback } from 'react';


export type TestJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TestJobResult {
  sku: string;
  passed: boolean;
  assertions: Array<{
    field: string;
    expected: string | null;
    actual: string | null;
    passed: boolean;
  }>;
}

export interface TestJobSummary {
  total: number;
  passed: number;
  failed: number;
}

export interface TestJobPollData {
  id: string;
  status: TestJobStatus;
  test_status?: 'passed' | 'failed' | 'partial';
  sku_results: TestJobResult[];
  summary: TestJobSummary;
  duration_ms?: number;
  error_message?: string | null;
}

export interface UseTestPollingOptions {
  /** Polling interval in milliseconds (default: 3000) */
  intervalMs?: number;
  /** Maximum number of polls before timeout (default: 100 = 5 minutes at 3s) */
  maxPolls?: number;
}

export interface UseTestPollingReturn {
  /** Current poll data, null until first successful fetch */
  data: TestJobPollData | null;
  /** Whether we are actively polling */
  isPolling: boolean;
  /** Human-readable progress label */
  progressLabel: string;
  /** Error message if polling failed or timed out */
  error: string | null;
  /** Start polling for a given job ID */
  startPolling: (jobId: string) => void;
  /** Reset all state back to idle */
  reset: () => void;
}

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLLS = 100;

export function useTestPolling(
  options: UseTestPollingOptions = {},
): UseTestPollingReturn {
  const { intervalMs = DEFAULT_INTERVAL_MS, maxPolls = DEFAULT_MAX_POLLS } = options;

  const [data, setData] = useState<TestJobPollData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobIdRef = useRef<string | null>(null);
  const pollCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPollingInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearPollingInterval();
    jobIdRef.current = null;
    pollCountRef.current = 0;
    setData(null);
    setIsPolling(false);
    setError(null);
  }, [clearPollingInterval]);

  const stopPolling = useCallback(() => {
    clearPollingInterval();
    setIsPolling(false);
  }, [clearPollingInterval]);

  const poll = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;

    pollCountRef.current += 1;

    if (pollCountRef.current > maxPolls) {
      setError('Test timed out. Check runner.');
      stopPolling();
      return;
    }

    try {
      const response = await fetch(`/api/admin/scrapers/studio/test/${jobId}`);

      if (!response.ok) {
if (!response.ok) {
        if (response.status === 404) {
          setError('Test job not found.');
          stopPolling();
          return;
        }
        return;
        }
        // For transient errors, keep polling
        return;
      }

      const json = await response.json();
      const pollData: TestJobPollData = {
        id: json.id ?? json.job_id ?? jobId,
        status: json.status,
        test_status: json.test_status,
        sku_results: json.sku_results ?? json.results ?? [],
        summary: json.summary ?? { total: 0, passed: 0, failed: 0 },
        duration_ms: json.duration_ms,
        error_message: json.error_message ?? null,
      };

      setData(pollData);

      if (pollData.status === 'completed' || pollData.status === 'failed') {
        stopPolling();
      }
    } catch {
      // Transient network error — timeout counter will eventually stop us
    }
  }, [maxPolls, stopPolling]);

  const startPolling = useCallback(
    (jobId: string) => {
      clearPollingInterval();
      jobIdRef.current = jobId;
      pollCountRef.current = 0;
      setData(null);
      setError(null);
      setIsPolling(true);

      poll();

      intervalRef.current = setInterval(poll, intervalMs);
    },
    [clearPollingInterval, intervalMs, poll],
  );

  useEffect(() => {
    return () => {
      clearPollingInterval();
    };
  }, [clearPollingInterval]);

  const progressLabel = deriveProgressLabel(data, isPolling, error);

  return { data, isPolling, progressLabel, error, startPolling, reset };
}

function deriveProgressLabel(
  data: TestJobPollData | null,
  isPolling: boolean,
  error: string | null,
): string {
  if (error) return error;
  if (!data) return '';
  if (!isPolling) {
    if (data.status === 'completed') return 'Completed';
    if (data.status === 'failed') return 'Failed';
    return '';
  }
  if (data.status === 'pending') return 'Queued...';
  if (data.status === 'running') {
    const { passed, failed, total } = data.summary;
    if (total > 0) {
      return `Running (${passed + failed}/${total} SKUs)...`;
    }
    return 'Running...';
  }
  return 'Processing...';
}