import { act, renderHook, waitFor } from '@testing-library/react';
import { useState, useEffect } from 'react';
import { useLogSubscription } from '@/lib/realtime/useLogSubscription';

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';
type PostgresChangeHandler = (payload: unknown) => void;
type SubscribeHandler = (status: RealtimeStatus) => void;

class MockRealtimeChannel {
  private readonly postgresChangeHandlers: PostgresChangeHandler[] = [];
  private subscribeHandler: SubscribeHandler | null = null;

  public readonly on = jest.fn(
    (_type: string, _filter: Record<string, unknown>, handler: PostgresChangeHandler) => {
      if (_type === 'postgres_changes') {
        this.postgresChangeHandlers.push(handler);
      }
      return this;
    },
  );

  public readonly subscribe = jest.fn((handler?: SubscribeHandler) => {
    this.subscribeHandler = handler ?? null;
    return this;
  });

  public readonly unsubscribe = jest.fn(async () => 'ok');

  public emitStatus(status: RealtimeStatus) {
    this.subscribeHandler?.(status);
  }

  public emitPostgresChange(payload: unknown) {
    for (const handler of this.postgresChangeHandlers) {
      handler(payload);
    }
  }
}

const mockChannels: MockRealtimeChannel[] = [];
const mockChannelFactory = jest.fn((_channelName: string) => {
  const channel = new MockRealtimeChannel();
  mockChannels.push(channel);
  return channel;
});
const mockRemoveChannel = jest.fn(async (_channel: MockRealtimeChannel) => 'ok');

jest.mock('@/lib/supabase/client', () => {
  return {
    createClient: jest.fn(() => ({
      channel: mockChannelFactory,
      removeChannel: mockRemoveChannel,
    })),
  };
});

jest.mock('@/lib/realtime/useRealtimeChannel', () => {
  const { useState, useEffect } = jest.requireActual('react') as typeof import('react');
  return {
    useRealtimeChannel: jest.fn((options: {
      channelName: string;
      autoConnect: boolean;
      onMessage: (payload: unknown) => void;
      onError?: (error: Error) => void;
    }) => {
      const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
      const [lastError] = useState<Error | null>(null);

      const channel = new MockRealtimeChannel();
      mockChannels.push(channel);

      const connect = () => {
        setConnectionState('connecting');
        setTimeout(() => {
          setConnectionState('connected');
        }, 0);
      };

      const disconnect = () => {
        setConnectionState('disconnected');
      };

      useEffect(() => {
        if (options.autoConnect) {
          connect();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return {
        connectionState,
        lastError,
        connect,
        disconnect,
      };
    }),
  };
});

describe('useLogSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannels.length = 0;
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useLogSubscription({ autoConnect: false }),
      );

      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.logs).toEqual([]);
    });

    it('should accept jobId filter', () => {
      const { result } = renderHook(() =>
        useLogSubscription({ jobId: 'job-123', autoConnect: false }),
      );

      expect(result.current.logs).toEqual([]);
    });

    it('should accept maxEntries option', () => {
      const { result } = renderHook(() =>
        useLogSubscription({ maxEntries: 100, autoConnect: false }),
      );

      expect(result.current.logs).toEqual([]);
    });
  });

  describe('connection management', () => {
    it('should expose connect function', () => {
      const { result } = renderHook(() =>
        useLogSubscription({ autoConnect: false }),
      );

      expect(typeof result.current.connect).toBe('function');
    });

    it('should expose disconnect function', () => {
      const { result } = renderHook(() =>
        useLogSubscription({ autoConnect: false }),
      );

      expect(typeof result.current.disconnect).toBe('function');
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs', () => {
      const { result } = renderHook(() =>
        useLogSubscription({ autoConnect: false }),
      );

      act(() => {
        result.current.clearLogs();
      });

      expect(result.current.logs).toEqual([]);
    });
  });

  describe('onLog callback', () => {
    it('should handle onLog callback option', () => {
      const onLog = jest.fn();
      renderHook(() =>
        useLogSubscription({ autoConnect: false, onLog }),
      );
      expect(onLog).not.toHaveBeenCalled();
    });
  });

  describe('channel sharing', () => {
    it('should create shared channel for same jobId', () => {
      renderHook(() =>
        useLogSubscription({ jobId: 'job-123', autoConnect: false }),
      );

      expect(mockChannelFactory).toHaveBeenCalledWith('runner-logs:job-123-pg');
    });

    it('should create different channels for different jobIds', () => {
      renderHook(() =>
        useLogSubscription({ jobId: 'job-1', autoConnect: false }),
      );
      renderHook(() =>
        useLogSubscription({ jobId: 'job-2', autoConnect: false }),
      );

      expect(mockChannelFactory).toHaveBeenCalledTimes(2);
      expect(mockChannelFactory).toHaveBeenCalledWith('runner-logs:job-1-pg');
      expect(mockChannelFactory).toHaveBeenCalledWith('runner-logs:job-2-pg');
    });

    it('should create all-logs channel when no jobId specified', () => {
      renderHook(() =>
        useLogSubscription({ autoConnect: false }),
      );

      expect(mockChannelFactory).toHaveBeenCalledWith('runner-logs:all-pg');
    });
  });

  describe('autoConnect behavior', () => {
    it('should auto-connect when autoConnect is true', async () => {
      const { result } = renderHook(() =>
        useLogSubscription({ autoConnect: true }),
      );

      // Wait for the state update from the timeout in the mock
      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    it('should not auto-connect when autoConnect is false', () => {
      const { result } = renderHook(() =>
        useLogSubscription({ autoConnect: false }),
      );

      expect(result.current.isConnected).toBe(false);
    });
  });
});
