import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Event Types
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

// Hook Return Type
export interface UseTestLabWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  lastError: Error | null;
  connect: () => void;
  disconnect: () => void;
  subscribeToTest: (testRunId: string) => void;
  subscribeToJob: (jobId: string) => void;
  lastSelectorEvent: SelectorValidationEvent | null;
  lastLoginEvent: LoginStatusEvent | null;
  lastExtractionEvent: ExtractionResultEvent | null;
}

export function useTestLabWebSocket(
  url: string = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:3001',
  apiKey: string = process.env.NEXT_PUBLIC_API_KEY || ''
): UseTestLabWebSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  // State for events
  const [lastSelectorEvent, setLastSelectorEvent] = useState<SelectorValidationEvent | null>(null);
  const [lastLoginEvent, setLastLoginEvent] = useState<LoginStatusEvent | null>(null);
  const [lastExtractionEvent, setLastExtractionEvent] = useState<ExtractionResultEvent | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    setIsConnecting(true);
    setLastError(null);

    const socket = io(url, {
      auth: {
        token: apiKey,
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setLastError(null);
      console.log('TestLab WebSocket connected');
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      setIsConnecting(false);
      console.log('TestLab WebSocket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      setIsConnecting(false);
      setLastError(err);
      console.error('TestLab WebSocket connection error:', err);
    });

    // Event Listeners
    socket.on('test_lab.selector.validation', (data: SelectorValidationEvent) => {
      setLastSelectorEvent({ ...data, timestamp: Date.now() });
    });

    socket.on('test_lab.login.status', (data: LoginStatusEvent) => {
      setLastLoginEvent({ ...data, timestamp: Date.now() });
    });

    socket.on('test_lab.extraction.result', (data: ExtractionResultEvent) => {
      setLastExtractionEvent({ ...data, timestamp: Date.now() });
    });

  }, [url, apiKey]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, []);

  const subscribeToTest = useCallback((testRunId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { room: `test_run:${testRunId}` });
    } else {
      console.warn('Cannot subscribe: Socket not connected');
    }
  }, []);

  const subscribeToJob = useCallback((jobId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { room: `job:${jobId}` });
    } else {
      console.warn('Cannot subscribe: Socket not connected');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
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
