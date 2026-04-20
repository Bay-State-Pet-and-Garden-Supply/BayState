import { act, renderHook, waitFor } from '@testing-library/react';
import { useRunnerPresence } from '@/lib/realtime/useRunnerPresence';

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';
type PostgresChangeHandler = (payload: unknown) => void;
type SubscribeHandler = (status: RealtimeStatus) => void;

class MockRealtimeChannel {
  private readonly postgresChangeHandlers: PostgresChangeHandler[] = [];
  private subscribeHandler: SubscribeHandler | null = null;

  public readonly on = jest.fn(
    (type: string, _filter: Record<string, unknown>, handler: PostgresChangeHandler) => {
      if (type === 'postgres_changes') {
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
            raw_status: 'busy',
            busy: true,
            labels: [{ name: 'primary' }],
            active_jobs: 1,
            enabled: true,
            last_seen: '2026-04-20T10:00:00.000Z',
            version: 'sha-123',
            build_check_reason: 'current',
            metadata: { region: 'us-east-1' },
          },
        ],
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() =>
      useRunnerPresence({ autoConnect: false, fetchInitial: false }),
    );

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.runners).toEqual({});
    expect(result.current.onlineIds.size).toBe(0);
  });

  it('fetches initial durable runners', async () => {
    const { result } = renderHook(() =>
      useRunnerPresence({ autoConnect: false, fetchInitial: true }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.runners['runner-1']).toEqual(
        expect.objectContaining({
          runner_id: 'runner-1',
          runner_name: 'Runner One',
          status: 'busy',
          raw_status: 'busy',
          active_jobs: 1,
          build_check_reason: 'current',
          version: 'sha-123',
        }),
      );
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/scraper-network/runners');
    expect(result.current.onlineIds.has('runner-1')).toBe(true);
  });

  it('connects to the shared scraper_runners channel when autoConnect is true', async () => {
    const { result } = renderHook(() =>
      useRunnerPresence({ autoConnect: true, fetchInitial: false }),
    );

    expect(mockChannelFactory).toHaveBeenCalledWith('scraper-runners-pg');

    act(() => {
      getLastChannel().emitStatus('SUBSCRIBED');
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it('updates runner state from scraper_runners Postgres changes', async () => {
    const { result } = renderHook(() =>
      useRunnerPresence({ autoConnect: true, fetchInitial: false }),
    );

    act(() => {
      getLastChannel().emitStatus('SUBSCRIBED');
      getLastChannel().emitPostgresChange({
        eventType: 'UPDATE',
        new: {
          name: 'runner-2',
          status: 'idle',
          current_job_id: null,
          enabled: true,
          last_seen_at: '2999-04-20T10:00:00.000Z',
          created_at: '2026-04-20T09:00:00.000Z',
          metadata: { region: 'us-west-2', build_check_reason: 'current' },
          jobs_completed: 12,
          memory_usage_mb: 256,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.runners['runner-2']).toEqual(
        expect.objectContaining({
          runner_id: 'runner-2',
          status: 'idle',
          raw_status: 'idle',
          active_jobs: 0,
        }),
      );
    });
  });

  it('marks runners offline when the durable row becomes stale', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-20T10:10:00.000Z'));

    const { result } = renderHook(() =>
      useRunnerPresence({ autoConnect: true, fetchInitial: false }),
    );

    act(() => {
      getLastChannel().emitStatus('SUBSCRIBED');
      getLastChannel().emitPostgresChange({
        eventType: 'UPDATE',
        new: {
          name: 'runner-3',
          status: 'busy',
          current_job_id: 'job-3',
          enabled: true,
          last_seen_at: '2026-04-20T10:00:00.000Z',
          created_at: '2026-04-20T09:00:00.000Z',
          metadata: {},
          jobs_completed: 4,
          memory_usage_mb: 128,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.runners['runner-3']?.status).toBe('offline');
    });

    expect(result.current.isOnline('runner-3')).toBe(false);
  });

  it('removes deleted runners from state', async () => {
    const { result } = renderHook(() =>
      useRunnerPresence({ autoConnect: true, fetchInitial: false }),
    );

    act(() => {
      getLastChannel().emitStatus('SUBSCRIBED');
      getLastChannel().emitPostgresChange({
        eventType: 'UPDATE',
        new: {
          name: 'runner-4',
          status: 'idle',
          current_job_id: null,
          enabled: true,
          last_seen_at: '2999-04-20T10:00:00.000Z',
          created_at: '2026-04-20T09:00:00.000Z',
          metadata: {},
          jobs_completed: 0,
          memory_usage_mb: null,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.getRunner('runner-4')).toBeDefined();
    });

    act(() => {
      getLastChannel().emitPostgresChange({
        eventType: 'DELETE',
        old: { name: 'runner-4' },
      });
    });

    await waitFor(() => {
      expect(result.current.getRunner('runner-4')).toBeUndefined();
    });
  });

  it('disconnects from the shared channel', async () => {
    const { result } = renderHook(() =>
      useRunnerPresence({ autoConnect: true, fetchInitial: false }),
    );

    act(() => {
      getLastChannel().emitStatus('SUBSCRIBED');
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('surfaces fetch errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useRunnerPresence({ autoConnect: false, fetchInitial: true }),
    );

    await waitFor(() => {
      expect(result.current.error).toEqual(new Error('Network error'));
    });
  });
});
