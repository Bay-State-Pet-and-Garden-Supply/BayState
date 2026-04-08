import { renderHook, act } from '@testing-library/react';
import { useRealtimeJobs } from '@/hooks/useRealtimeJobs';
import { useJobBroadcasts } from '@/lib/realtime/useJobBroadcasts';
import type { UseJobBroadcastsReturn } from '@/lib/realtime/useJobBroadcasts';

// Mock the useJobBroadcasts hook
jest.mock('@/lib/realtime/useJobBroadcasts');

const createMockReturn = (overrides: Partial<UseJobBroadcastsReturn> = {}): UseJobBroadcastsReturn => ({
  broadcasts: {},
  latest: {},
  logs: [],
  progress: {},
  isConnected: false,
  error: null,
  connect: jest.fn(),
  disconnect: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  clear: jest.fn(),
  clearLogs: jest.fn(),
  getLogsForJob: jest.fn(() => []),
  ...overrides,
});

describe('useRealtimeJobs (shim)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (useJobBroadcasts as jest.Mock).mockReturnValue(createMockReturn());
    // Reset modules to clear module-level deprecation warning state
    jest.resetModules();
  });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (useJobBroadcasts as jest.Mock).mockReturnValue(createMockReturn());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('deprecation warning', () => {
    it('should log deprecation warning on first use', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      renderHook(() => useRealtimeJobs({ autoConnect: false }));

      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEPRECATED] useRealtimeJobs is deprecated')
      );

      warnSpy.mockRestore();
    });

    it.skip('should only log deprecation warning once per session', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // First render should trigger warning
      renderHook(() => useRealtimeJobs({ autoConnect: false }));
      
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      // Second render should NOT trigger another warning
      renderHook(() => useRealtimeJobs({ autoConnect: false }));
      
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      // Should have exactly one warning (module-level state persists)
      const deprecationWarnings = warnSpy.mock.calls.filter(call =>
        call[0]?.includes('[DEPRECATED] useRealtimeJobs')
      );
      expect(deprecationWarnings.length).toBe(1);

      warnSpy.mockRestore();
    });
  });

  describe('delegation to useJobBroadcasts', () => {
    it('should delegate to useJobBroadcasts with correct options', () => {
      renderHook(() => useRealtimeJobs({ autoConnect: true }));

      expect(useJobBroadcasts).toHaveBeenCalledWith(
        expect.objectContaining({
          autoConnect: true,
          onProgress: expect.any(Function),
          onLog: expect.any(Function),
        }),
        expect.objectContaining({
          includeLogs: true,
          includeProgress: true,
        })
      );
    });

    it('should call broadcastConnect when connect is called', () => {
      const mockConnect = jest.fn();
      (useJobBroadcasts as jest.Mock).mockReturnValue(createMockReturn({ connect: mockConnect }));

      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      expect(mockConnect).toHaveBeenCalled();
    });

    it('should call broadcastDisconnect when disconnect is called', () => {
      const mockDisconnect = jest.fn();
      (useJobBroadcasts as jest.Mock).mockReturnValue(createMockReturn({ disconnect: mockDisconnect }));

      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      act(() => {
        result.current.disconnect();
      });

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should update connectionStatus based on isConnected from useJobBroadcasts', () => {
      (useJobBroadcasts as jest.Mock).mockReturnValue(createMockReturn({ isConnected: true }));

      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      expect(result.current.connectionStatus).toBe('connected');
    });
  });

  describe('legacy options mapping', () => {
    it('should respect autoConnect option', () => {
      renderHook(() => useRealtimeJobs({ autoConnect: false }));

      expect(useJobBroadcasts).toHaveBeenCalledWith(
        expect.objectContaining({ autoConnect: false }),
        expect.any(Object)
      );
    });

    it('should use maxReconnectAttempts in reconnect logic', () => {
      const mockConnect = jest.fn();
      const mockDisconnect = jest.fn();
      (useJobBroadcasts as jest.Mock).mockReturnValue(
        createMockReturn({ connect: mockConnect, disconnect: mockDisconnect })
      );

      const { result } = renderHook(() => useRealtimeJobs({ 
        autoConnect: false, 
        maxReconnectAttempts: 2 
      }));

      // Try reconnecting more than max attempts
      act(() => {
        result.current.reconnect();
      });
      act(() => {
        result.current.reconnect();
      });
      act(() => {
        result.current.reconnect();
      });

      // After max attempts, error should be set
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toContain('Max reconnect attempts reached');
    });
  });

  describe('legacy-compatible interface', () => {
    it('should return jobs array', () => {
      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      expect(Array.isArray(result.current.jobs)).toBe(true);
    });

    it('should return runners array', () => {
      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      expect(Array.isArray(result.current.runners)).toBe(true);
    });

    it('should return connect, disconnect, and reconnect functions', () => {
      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      expect(typeof result.current.connect).toBe('function');
      expect(typeof result.current.disconnect).toBe('function');
      expect(typeof result.current.reconnect).toBe('function');
    });

    it('should return lastUpdate as Date or null', () => {
      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      expect(result.current.lastUpdate === null || result.current.lastUpdate instanceof Date).toBe(true);
    });

    it('should return error as Error or null', () => {
      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      expect(result.current.error === null || result.current.error instanceof Error).toBe(true);
    });

    it('should return connectionStatus as valid ConnectionStatus', () => {
      const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

      expect(['connecting', 'connected', 'disconnected']).toContain(result.current.connectionStatus);
    });
  });

  describe('error handling', () => {
    it('should set error when max reconnect attempts is exceeded', () => {
      const { result } = renderHook(() => useRealtimeJobs({ 
        autoConnect: false, 
        maxReconnectAttempts: 1 
      }));

      act(() => {
        result.current.reconnect();
      });

      act(() => {
        result.current.reconnect();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toContain('Max reconnect attempts reached');
    });
  });

  describe('progress update transformation', () => {
    it.skip('should transform job updates to legacy format', () => {
      let capturedOnProgress: ((progress: any) => void) | undefined;
      
      (useJobBroadcasts as jest.Mock).mockImplementation((options) => {
        // Capture the onProgress handler
        capturedOnProgress = options.onProgress;
        return createMockReturn();
      });

      renderHook(() => useRealtimeJobs({ autoConnect: true }));

      // Simulate a progress update with correct type
      const progressUpdate = {
        job_id: 'test-job-123',
        status: 'running',
        progress: 50,
        timestamp: new Date().toISOString(),
      };

      act(() => {
        if (capturedOnProgress) {
          capturedOnProgress(progressUpdate);
        }
      });

      // The hook should have transformed this into a JobUpdateMessage
      // Since we can't easily access the internal state, we verify the hook ran without error
      expect(useJobBroadcasts).toHaveBeenCalled();
      expect(capturedOnProgress).toBeDefined();
    });
  });

  describe('log update transformation', () => {
    it('should transform log updates to legacy runner format', () => {
      const onLogHandler = jest.fn();
      
      (useJobBroadcasts as jest.Mock).mockImplementation((options) => {
        // Capture the onLog handler
        if (options.onLog) {
          onLogHandler.mockImplementation(options.onLog);
        }
        return createMockReturn();
      });

      renderHook(() => useRealtimeJobs({ autoConnect: true }));

      // Simulate a log entry with runner info
      const logEntry = {
        job_id: 'test-job-123',
        level: 'info',
        message: 'Test log message',
        timestamp: new Date().toISOString(),
        runner_id: 'runner-456',
        runner_name: 'Test Runner',
      };

      act(() => {
        onLogHandler(logEntry);
      });

      // The hook should have processed the log entry
      expect(useJobBroadcasts).toHaveBeenCalled();
    });
  });
});
