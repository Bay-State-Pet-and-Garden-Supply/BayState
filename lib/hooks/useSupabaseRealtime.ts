import { useEffect, useRef, useState, useCallback } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '../supabase/client';

// Event Types (same as useTestLabWebSocket for backward compatibility)
export interface SelectorValidationEvent {
  selector: string;
  status: 'valid' | 'invalid' | 'pending';
  elementCount: number;
  sampleText?: string;
  error?: string;
  timestamp: number;
}

export interface LoginStatusEvent {
  status: 'success' | 'failed' | 'pending' | '2fa_required';
  message?: string;
  screenshotUrl?: string;
  timestamp: number;
}

export interface ExtractionResultEvent {
  field: string;
  value: any;
  confidence: number;
  sourceHtml?: string;
  timestamp: number;
}

// Connection status type
export type ConnectionStatus = 'connected' | 'connecting' | 'polling' | 'error';

// Hook Return Type (same interface as useTestLabWebSocket)
export interface UseTestLabWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isPolling: boolean;
  connectionStatus: ConnectionStatus;
  lastError: Error | null;
  connect: () => void;
  disconnect: () => void;
  subscribeToTest: (testRunId: string) => void;
  subscribeToJob: (jobId: string) => void;
  lastSelectorEvent: SelectorValidationEvent | null;
  lastLoginEvent: LoginStatusEvent | null;
  lastExtractionEvent: ExtractionResultEvent | null;
}

// Polling interval in milliseconds
const POLLING_INTERVAL = 5000;

// Database row types
interface SelectorResultRow {
  id: string;
  test_run_id: string;
  selector: string;
  status: 'valid' | 'invalid' | 'pending';
  element_count: number;
  sample_text?: string;
  error?: string;
  created_at: string;
}

interface LoginResultRow {
  id: string;
  test_run_id: string;
  status: 'success' | 'failed' | 'pending' | '2fa_required';
  message?: string;
  screenshot_url?: string;
  created_at: string;
}

interface ExtractionResultRow {
  id: string;
  test_run_id: string;
  field: string;
  value: any;
  confidence: number;
  source_html?: string;
  created_at: string;
}

export function useSupabaseRealtime(): UseTestLabWebSocketReturn {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeTestRunIdRef = useRef<string | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastError, setLastError] = useState<Error | null>(null);

  // State for events
  const [lastSelectorEvent, setLastSelectorEvent] = useState<SelectorValidationEvent | null>(null);
  const [lastLoginEvent, setLastLoginEvent] = useState<LoginStatusEvent | null>(null);
  const [lastExtractionEvent, setLastExtractionEvent] = useState<ExtractionResultEvent | null>(null);

  // Get or create Supabase client
  const getSupabaseClient = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

  // Transform database row to SelectorValidationEvent
  const transformSelectorEvent = (row: SelectorResultRow): SelectorValidationEvent => ({
    selector: row.selector,
    status: row.status,
    elementCount: row.element_count,
    sampleText: row.sample_text,
    error: row.error,
    timestamp: new Date(row.created_at).getTime(),
  });

  // Transform database row to LoginStatusEvent
  const transformLoginEvent = (row: LoginResultRow): LoginStatusEvent => ({
    status: row.status,
    message: row.message,
    screenshotUrl: row.screenshot_url,
    timestamp: new Date(row.created_at).getTime(),
  });

  // Transform database row to ExtractionResultEvent
  const transformExtractionEvent = (row: ExtractionResultRow): ExtractionResultEvent => ({
    field: row.field,
    value: row.value,
    confidence: row.confidence,
    sourceHtml: row.source_html,
    timestamp: new Date(row.created_at).getTime(),
  });

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Start polling helper
  const startPolling = useCallback(() => {
    stopPolling();
    setIsPolling(true);
    setConnectionStatus('polling');

    // Initial poll
    pollForUpdates();

    // Set up interval
    pollingIntervalRef.current = setInterval(() => {
      pollForUpdates();
    }, POLLING_INTERVAL);
  }, [stopPolling]);

  // Poll for updates from Supabase
  const pollForUpdates = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const testRunId = activeTestRunIdRef.current;

      if (!testRunId) {
        return;
      }

      // Poll all three result tables
      const [selectorResults, loginResults, extractionResults] = await Promise.all([
        supabase
          .from('scraper_selector_results')
          .select('*')
          .eq('test_run_id', testRunId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('scraper_login_results')
          .select('*')
          .eq('test_run_id', testRunId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('scraper_extraction_results')
          .select('*')
          .eq('test_run_id', testRunId)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (selectorResults.data && selectorResults.data.length > 0) {
        const row = selectorResults.data[0] as SelectorResultRow;
        setLastSelectorEvent(transformSelectorEvent(row));
      }

      if (loginResults.data && loginResults.data.length > 0) {
        const row = loginResults.data[0] as LoginResultRow;
        setLastLoginEvent(transformLoginEvent(row));
      }

      if (extractionResults.data && extractionResults.data.length > 0) {
        const row = extractionResults.data[0] as ExtractionResultRow;
        setLastExtractionEvent(transformExtractionEvent(row));
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, [getSupabaseClient]);

  // Subscribe to Supabase Realtime channels
  const subscribeToRealtime = useCallback((testRunId: string) => {
    const supabase = getSupabaseClient();

    // Clean up existing channels
    channelsRef.current.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Create selector results channel
    const selectorChannel = supabase
      .channel(`selector_results:${testRunId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scraper_selector_results',
          filter: `test_run_id=eq.${testRunId}`,
        },
        (payload: RealtimePostgresChangesPayload<SelectorResultRow>) => {
          if (payload.new && typeof payload.new === 'object') {
            setLastSelectorEvent(transformSelectorEvent(payload.new as SelectorResultRow));
          }
        }
      )
      .subscribe();

    // Create login results channel
    const loginChannel = supabase
      .channel(`login_results:${testRunId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scraper_login_results',
          filter: `test_run_id=eq.${testRunId}`,
        },
        (payload: RealtimePostgresChangesPayload<LoginResultRow>) => {
          if (payload.new && typeof payload.new === 'object') {
            setLastLoginEvent(transformLoginEvent(payload.new as LoginResultRow));
          }
        }
      )
      .subscribe();

    // Create extraction results channel
    const extractionChannel = supabase
      .channel(`extraction_results:${testRunId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scraper_extraction_results',
          filter: `test_run_id=eq.${testRunId}`,
        },
        (payload: RealtimePostgresChangesPayload<ExtractionResultRow>) => {
          if (payload.new && typeof payload.new === 'object') {
            setLastExtractionEvent(transformExtractionEvent(payload.new as ExtractionResultRow));
          }
        }
      )
      .subscribe();

    channelsRef.current = [selectorChannel, loginChannel, extractionChannel];
    setIsConnected(true);
    setIsConnecting(false);
    setIsPolling(false);
    setConnectionStatus('connected');
    setLastError(null);
  }, [getSupabaseClient]);

  // Connect method
  const connect = useCallback(() => {
    if (!isConnected && !isConnecting) {
      setIsConnecting(true);
      setConnectionStatus('connecting');

      if (activeTestRunIdRef.current) {
        subscribeToRealtime(activeTestRunIdRef.current);
      } else if (activeJobIdRef.current) {
        console.warn('subscribeToJob called without active test_run_id');
        setIsConnecting(false);
        setConnectionStatus('error');
      } else {
        setIsConnecting(false);
        setConnectionStatus('connected');
      }
    }
  }, [isConnected, isConnecting, subscribeToRealtime]);

  // Disconnect method
  const disconnect = useCallback(() => {
    stopPolling();

    const supabase = getSupabaseClient();
    channelsRef.current.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    setIsConnected(false);
    setIsConnecting(false);
    setIsPolling(false);
    setConnectionStatus('connecting');
    activeTestRunIdRef.current = null;
    activeJobIdRef.current = null;
  }, [getSupabaseClient, stopPolling]);

  // Subscribe to test run
  const subscribeToTest = useCallback((testRunId: string) => {
    activeTestRunIdRef.current = testRunId;
    activeJobIdRef.current = null;

    try {
      subscribeToRealtime(testRunId);
    } catch (err) {
      console.error('Realtime subscription failed:', err);
      setLastError(err instanceof Error ? err : new Error('Failed to subscribe to realtime'));
      setConnectionStatus('error');
      startPolling();
    }
  }, [subscribeToRealtime, startPolling]);

  // Subscribe to job
  const subscribeToJob = useCallback((jobId: string) => {
    activeJobIdRef.current = jobId;
    activeTestRunIdRef.current = null;
    console.warn('subscribeToJob: polling fallback (jobId:', jobId, ')');
    startPolling();
  }, [startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Auto-connect on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      connect();
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [connect]);

  return {
    isConnected,
    isConnecting,
    isPolling,
    connectionStatus,
    lastError,
    connect,
    disconnect,
    subscribeToTest,
    subscribeToJob,
    lastSelectorEvent,
    lastLoginEvent,
    lastExtractionEvent,
  };
}
