'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLogSubscription } from '@/lib/realtime/useLogSubscription';
import { 
  reduceLogsToPhases, 
  mergeScrapeJobLogs, 
  normalizeScrapeLogEntry,
  type ScrapeJobLogEntry, 
  type JobPhase 
} from '@/lib/scraper-logs';
import { adminFetch } from '@/lib/admin/api-client';

interface UseJobConsoleOptions {
  jobId: string | null;
  maxEntries?: number;
}

export function useJobConsole({ jobId, maxEntries = 1000 }: UseJobConsoleOptions) {
  const [historyLogs, setHistoryLogs] = useState<ScrapeJobLogEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<Error | null>(null);

  // Subscribe to live logs for this specific job
  const { 
    logs: liveLogs, 
    isConnected, 
    error: realtimeError,
    clearLogs 
  } = useLogSubscription({
    jobId: jobId || undefined,
    maxEntries,
    autoConnect: !!jobId,
  });

  // Fetch historical logs when jobId changes
  useEffect(() => {
    if (!jobId) {
      setHistoryLogs([]);
      clearLogs();
      return;
    }

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      setHistoryError(null);
      try {
        const response = await adminFetch(`/api/admin/scraper-network/jobs/${jobId}/history`);
        if (!response.ok) throw new Error('Failed to fetch job history');
        const data = await response.json();
        
        const normalized = (data.logs || []).map((l: any) => 
          normalizeScrapeLogEntry(l, { persisted: true, jobId })
        );
        setHistoryLogs(normalized);
      } catch (err) {
        setHistoryError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [jobId, clearLogs]);

  // Merge history and live logs
  const allLogs = useMemo(() => {
    return mergeScrapeJobLogs(historyLogs, liveLogs, maxEntries);
  }, [historyLogs, liveLogs, maxEntries]);

  // Reduce logs to structured phases
  const phases = useMemo(() => {
    return reduceLogsToPhases(allLogs);
  }, [allLogs]);

  return {
    phases,
    allLogs,
    isLoading: isLoadingHistory,
    isConnected,
    error: historyError || realtimeError,
  };
}
