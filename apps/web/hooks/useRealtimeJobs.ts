import { useState, useEffect, useRef, useCallback } from 'react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface JobUpdateMessage {
  type: 'job_update';
  jobId: string;
  status: string;
  progress: number;
  timestamp: string;
}

interface RunnerUpdateMessage {
  type: 'runner_update';
  runnerId: string;
  status: string;
  activeJobs: number;
  timestamp: string;
}

type WebSocketMessage = JobUpdateMessage | RunnerUpdateMessage;

interface UseRealtimeJobsOptions {
  url?: string;
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  pollingFallback?: boolean;
}

interface UseRealtimeJobsReturn {
  jobs: JobUpdateMessage[];
  runners: RunnerUpdateMessage[];
  connectionStatus: ConnectionStatus;
  lastUpdate: Date | null;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useRealtimeJobs(options: UseRealtimeJobsOptions = {}): UseRealtimeJobsReturn {
  const {
    url = '/api/ws/jobs',
    autoConnect = true,
    maxReconnectAttempts = 5,
    pollingFallback = true,
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [jobs, setJobs] = useState<JobUpdateMessage[]>([]);
  const [runners, setRunners] = useState<RunnerUpdateMessage[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearPollingInterval = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      setLastUpdate(new Date());

      if (message.type === 'job_update') {
        setJobs((prev) => {
          const filtered = prev.filter((j) => j.jobId !== message.jobId);
          return [...filtered, message].slice(-100);
        });
      } else if (message.type === 'runner_update') {
        setRunners((prev) => {
          const filtered = prev.filter((r) => r.runnerId !== message.runnerId);
          return [...filtered, message].slice(-50);
        });
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, []);

  const startPolling = useCallback(() => {
    clearPollingInterval();
    pollingIntervalRef.current = setInterval(() => {
      fetch('/api/jobs/latest')
        .then((res) => res.json())
        .then((data) => {
          if (data.jobs) {
            data.jobs.forEach((job: JobUpdateMessage) => {
              handleMessage({ data: JSON.stringify(job) } as MessageEvent);
            });
          }
        })
        .catch(console.error);
    }, 5000);
  }, [handleMessage, clearPollingInterval]);

  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    clearReconnectTimeout();
    setConnectionStatus('connecting');
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        clearPollingInterval();
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        setError(new Error('WebSocket error occurred'));
        console.error('WebSocket error:', event);
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        wsRef.current = null;

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, delay);
        } else if (pollingFallback) {
          startPolling();
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'));
      setConnectionStatus('disconnected');
      if (pollingFallback) {
        startPolling();
      }
    }
  }, [url, maxReconnectAttempts, pollingFallback, handleMessage, startPolling, clearReconnectTimeout, clearPollingInterval]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    clearPollingInterval();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    if (autoConnect) {
      const timeoutId = setTimeout(() => {
        connect();
      }, 0);
      return () => {
        clearTimeout(timeoutId);
        disconnect();
      };
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    jobs,
    runners,
    connectionStatus,
    lastUpdate,
    error,
    connect,
    disconnect,
    reconnect,
  };
}
