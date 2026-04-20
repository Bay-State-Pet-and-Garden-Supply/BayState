import { act, renderHook, waitFor } from '@testing-library/react';
import { useJobSubscription } from '@/lib/realtime/useJobSubscription';

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
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              in: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  execute: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })),
  };
});

describe('useJobSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannels.length = 0;
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }),
      );

      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.jobs).toEqual({
        pending: [],
        running: [],
        completed: [],
        failed: [],
        cancelled: [],
      });
      expect(result.current.counts).toEqual({
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
      });
      expect(result.current.latestJob).toBeNull();
    });

    it('should accept custom channel name', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ channelName: 'custom-jobs', autoConnect: false }),
      );

      expect(result.current.isConnected).toBe(false);
    });

    it('should accept maxJobsPerStatus option', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ maxJobsPerStatus: 25, autoConnect: false }),
      );

      expect(result.current.jobs).toBeDefined();
    });
  });

  describe('filters', () => {
    it('should handle jobIds filter', () => {
      renderHook(() =>
        useJobSubscription({ jobIds: ['job-1', 'job-2'], autoConnect: false }),
      );

      expect(mockChannelFactory).toHaveBeenCalled();
    });

    it('should handle scraperNames filter', () => {
      renderHook(() =>
        useJobSubscription({ scraperNames: ['petco', 'chewy'], autoConnect: false }),
      );

      expect(mockChannelFactory).toHaveBeenCalled();
    });

    it('should handle testModeOnly filter', () => {
      renderHook(() =>
        useJobSubscription({ testModeOnly: true, autoConnect: false }),
      );

      expect(mockChannelFactory).toHaveBeenCalled();
    });
  });

  describe('event filters', () => {
    it('should handle includeInsert filter', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }, { includeInsert: true }),
      );

      expect(result.current).toBeDefined();
    });

    it('should handle includeUpdate filter', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }, { includeUpdate: true }),
      );

      expect(result.current).toBeDefined();
    });

    it('should handle includeDelete filter', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }, { includeDelete: false }),
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('connection management', () => {
    it('should expose connect function', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }),
      );

      expect(typeof result.current.connect).toBe('function');
    });

    it('should expose disconnect function', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }),
      );

      expect(typeof result.current.disconnect).toBe('function');
    });
  });

  describe('refetch', () => {
    it('should expose refetch function', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }),
      );

      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('getJob', () => {
    it('should return undefined for non-existent job', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }),
      );

      const job = result.current.getJob('non-existent');
      expect(job).toBeUndefined();
    });
  });

  describe('getJobsForRunner', () => {
    it('should return empty array for non-existent runner', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }),
      );

      const jobs = result.current.getJobsForRunner('runner-123');
      expect(jobs).toEqual([]);
    });
  });

  describe('callbacks', () => {
    it('should handle onJobCreated callback', () => {
      const onJobCreated = jest.fn();
      renderHook(() =>
        useJobSubscription({ autoConnect: false, onJobCreated }),
      );
      expect(onJobCreated).not.toHaveBeenCalled();
    });

    it('should handle onJobUpdated callback', () => {
      const onJobUpdated = jest.fn();
      renderHook(() =>
        useJobSubscription({ autoConnect: false, onJobUpdated }),
      );
      expect(onJobUpdated).not.toHaveBeenCalled();
    });

    it('should handle onJobDeleted callback', () => {
      const onJobDeleted = jest.fn();
      renderHook(() =>
        useJobSubscription({ autoConnect: false, onJobDeleted }),
      );
      expect(onJobDeleted).not.toHaveBeenCalled();
    });
  });

  describe('autoConnect behavior', () => {
    it('should auto-connect when autoConnect is true', async () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: true }),
      );

      act(() => {
        mockChannels[0]?.emitStatus('SUBSCRIBED');
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    it('should not auto-connect when autoConnect is false', () => {
      const { result } = renderHook(() =>
        useJobSubscription({ autoConnect: false }),
      );

      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('channel sharing', () => {
    it('should create shared channel for same channel name', () => {
      renderHook(() =>
        useJobSubscription({ channelName: 'shared-jobs', autoConnect: false }),
      );

      expect(mockChannelFactory).toHaveBeenCalledWith('shared-jobs-pg');
    });
  });
});
