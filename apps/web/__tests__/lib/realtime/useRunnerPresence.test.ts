import { act, renderHook, waitFor } from '@testing-library/react';
import { useRunnerPresence } from '@/lib/realtime/useRunnerPresence';

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';
type PresenceHandler = (payload: unknown) => void;
type SubscribeHandler = (status: RealtimeStatus) => void;

class MockRealtimeChannel {
  private readonly presenceHandlers: Map<string, PresenceHandler[]> = new Map();
  private subscribeHandler: SubscribeHandler | null = null;

  public readonly on = jest.fn(
    (type: string, _filter: Record<string, unknown>, handler: PresenceHandler) => {
      if (type === 'presence') {
        const key = `${type}-${JSON.stringify(_filter)}`;
        const handlers = this.presenceHandlers.get(key) || [];
        handlers.push(handler);
        this.presenceHandlers.set(key, handlers);
      }
      return this;
    },
  );

  public readonly subscribe = jest.fn((handler?: SubscribeHandler) => {
    this.subscribeHandler = handler ?? null;
    return this;
  });

  public readonly unsubscribe = jest.fn(async () => 'ok');

  public readonly track = jest.fn(async () => ({}));

  public readonly presenceState = jest.fn(() => ({}));

  public emitStatus(status: RealtimeStatus) {
    this.subscribeHandler?.(status);
  }

  public emitPresenceSync() {
    this.presenceHandlers.forEach((handlers) => {
      handlers.forEach((handler) => {
        handler({});
      });
    });
  }
}

const mockChannels: MockRealtimeChannel[] = [];
const mockChannelFactory = jest.fn((_channelName: string) => {
  const channel = new MockRealtimeChannel();
  mockChannels.push(channel);
  return channel;
});
const mockRemoveChannel = jest.fn(async (_channel: MockRealtimeChannel) => 'ok');

const mockFetch = jest.fn();

jest.mock('@/lib/supabase/client', () => {
  return {
    createClient: jest.fn(() => ({
      channel: mockChannelFactory,
      removeChannel: mockRemoveChannel,
    })),
  };
});

global.fetch = mockFetch;

function getLastChannel(): MockRealtimeChannel {
  const channel = mockChannels.at(-1);
  if (!channel) {
    throw new Error('Expected a realtime channel to be created.');
  }
  return channel;
}

describe('useRunnerPresence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannels.length = 0;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        runners: [
          {
            id: 'runner-1',
            name: 'Runner One',
            os: 'linux',
            status: 'online',
            busy: false,
            labels: [],
            active_jobs: 0,
            enabled: true,
          },
        ],
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default state', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.runners).toEqual({});
      expect(result.current.onlineIds.size).toBe(0);
    });

    it('should accept custom channel name', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() =>
        useRunnerPresence({ channelName: 'custom-presence', autoConnect: false, fetchInitial: false }),
      );

      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('connection management', () => {
    it('should connect to presence channel when autoConnect is true', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: true, fetchInitial: false }),
      );

      act(() => {
        jest.advanceTimersByTime(0);
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    it('should not connect when autoConnect is false', async () => {
      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      expect(result.current.isConnected).toBe(false);
    });

    it('should not create duplicate channels on multiple connect calls', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      act(() => {
        result.current.connect();
      });

      const channelCountAfterFirst = mockChannelFactory.mock.calls.length;

      act(() => {
        result.current.connect();
      });

      expect(mockChannelFactory.mock.calls.length).toBe(channelCountAfterFirst);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from presence channel', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: true, fetchInitial: false }),
      );

      act(() => {
        jest.advanceTimersByTime(0);
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('fetchInitial', () => {
    it('should fetch initial runners when fetchInitial is true', async () => {
      jest.useFakeTimers();

      renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: true }),
      );

      await act(async () => {
        jest.advanceTimersByTime(0);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not fetch when fetchInitial is false', async () => {
      renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should set isLoading state while fetching', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: true }),
      );

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle fetch error gracefully', async () => {
      jest.useFakeTimers();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: true }),
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      });

      expect(result.current.error).toEqual(new Error('Network error'));
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('sync', () => {
    it('should expose sync function', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      act(() => {
        result.current.connect();
      });

      expect(typeof result.current.sync).toBe('function');
    });
  });

  describe('getRunner', () => {
    it('should return undefined for non-existent runner', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      const runner = result.current.getRunner('non-existent');
      expect(runner).toBeUndefined();
    });
  });

  describe('getOnlineCount', () => {
    it('should return 0 when no runners online', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      expect(result.current.getOnlineCount()).toBe(0);
    });
  });

  describe('getBusyCount', () => {
    it('should return 0 when no runners busy', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      expect(result.current.getBusyCount()).toBe(0);
    });
  });

  describe('isOnline', () => {
    it('should return false for non-existent runner', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false }),
      );

      expect(result.current.isOnline('non-existent')).toBe(false);
    });
  });

  describe('callbacks', () => {
    it('should handle onJoin callback', async () => {
      jest.useFakeTimers();

      const onJoin = jest.fn();
      renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false, onJoin }),
      );

      expect(onJoin).not.toHaveBeenCalled();
    });

    it('should handle onLeave callback', async () => {
      jest.useFakeTimers();

      const onLeave = jest.fn();
      renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false, onLeave }),
      );

      expect(onLeave).not.toHaveBeenCalled();
    });

    it('should handle onSync callback', async () => {
      jest.useFakeTimers();

      const onSync = jest.fn();
      renderHook(() =>
        useRunnerPresence({ autoConnect: false, fetchInitial: false, onSync }),
      );

      expect(onSync).not.toHaveBeenCalled();
    });
  });
});
