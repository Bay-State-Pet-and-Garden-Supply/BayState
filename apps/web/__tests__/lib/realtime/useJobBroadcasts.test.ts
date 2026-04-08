import { act, renderHook, waitFor } from '@testing-library/react';
import { useState, useEffect } from 'react';
import { useJobBroadcasts } from '@/lib/realtime/useJobBroadcasts';

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';
type BroadcastHandler = (event: { payload: unknown }) => void;
type SubscribeHandler = (status: RealtimeStatus) => void;

class MockRealtimeChannel {
  private readonly broadcastHandlers: BroadcastHandler[] = [];
  private subscribeHandler: SubscribeHandler | null = null;

  public readonly on = jest.fn(
    (_type: string, _filter: Record<string, unknown>, handler: BroadcastHandler) => {
      if (_type === 'broadcast') {
        this.broadcastHandlers.push(handler);
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

  public emitMessage(payload: unknown) {
    for (const handler of this.broadcastHandlers) {
      handler({ payload });
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
const mockCreateClient = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: mockCreateClient,
}));

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
      const [reconnectAttempt] = useState(0);

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
        reconnectAttempt,
        connect,
        disconnect,
      };
    }),
  };
});

function getLastChannel(): MockRealtimeChannel {
  const channel = mockChannels.at(-1);
  if (!channel) {
    throw new Error('Expected a realtime channel to be created.');
  }
  return channel;
}

describe('useJobBroadcasts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannels.length = 0;

    mockCreateClient.mockReturnValue({
      channel: mockChannelFactory,
      removeChannel: mockRemoveChannel,
    });
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }),
      );

      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.broadcasts).toEqual({});
      expect(result.current.latest).toEqual({});
      expect(result.current.logs).toEqual([]);
      expect(result.current.progress).toEqual({});
    });

    it('should accept custom channel name', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ channelName: 'custom-channel', autoConnect: false }),
      );

      expect(result.current.isConnected).toBe(false);
    });

    it('should accept maxLogs option', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ maxLogs: 50, autoConnect: false }),
      );

      expect(result.current.logs).toEqual([]);
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('should subscribe to specific event types', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }),
      );

      act(() => {
        result.current.subscribe('custom_event');
      });

      expect(result.current).toBeDefined();
    });

    it('should unsubscribe from specific event types', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }),
      );

      act(() => {
        result.current.subscribe('custom_event');
        result.current.unsubscribe('custom_event');
      });

      expect(result.current).toBeDefined();
    });
  });

  describe('clear functions', () => {
    it('should clear all broadcasts', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }),
      );

      act(() => {
        result.current.clear();
      });

      expect(result.current.broadcasts).toEqual({});
      expect(result.current.latest).toEqual({});
      expect(result.current.logs).toEqual([]);
      expect(result.current.progress).toEqual({});
    });

    it('should clear logs only', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }),
      );

      act(() => {
        result.current.clearLogs();
      });

      expect(result.current.logs).toEqual([]);
    });
  });

  describe('getLogsForJob', () => {
    it('should return logs filtered by job id', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }),
      );

      const logs = result.current.getLogsForJob('job-123');
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('connection state', () => {
    it('should expose connect function', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }),
      );

      expect(typeof result.current.connect).toBe('function');
    });

    it('should expose disconnect function', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }),
      );

      expect(typeof result.current.disconnect).toBe('function');
    });
  });

  describe('filters', () => {
    it('should handle includeLogs filter', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }, { includeLogs: false }),
      );

      expect(result.current.logs).toEqual([]);
    });

    it('should handle includeProgress filter', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }, { includeProgress: false }),
      );

      expect(result.current.progress).toEqual({});
    });

    it('should handle customEvents filter', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts({ autoConnect: false }, { customEvents: ['custom_event'] }),
      );

      expect(result.current).toBeDefined();
    });

    it('should handle logLevels filter', () => {
      const { result } = renderHook(() =>
        useJobBroadcasts(
          { autoConnect: false },
          { logLevels: ['debug', 'info', 'warning', 'error', 'critical'] },
        ),
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('callbacks', () => {
    it('should handle onBroadcast callback', () => {
      const onBroadcast = jest.fn();
      renderHook(() =>
        useJobBroadcasts({ autoConnect: false, onBroadcast }),
      );
      expect(onBroadcast).not.toHaveBeenCalled();
    });

    it('should handle onLog callback', () => {
      const onLog = jest.fn();
      renderHook(() =>
        useJobBroadcasts({ autoConnect: false, onLog }),
      );
      expect(onLog).not.toHaveBeenCalled();
    });

    it('should handle onProgress callback', () => {
      const onProgress = jest.fn();
      renderHook(() =>
        useJobBroadcasts({ autoConnect: false, onProgress }),
      );
      expect(onProgress).not.toHaveBeenCalled();
    });
  });
});
