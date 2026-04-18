import { act, renderHook } from '@testing-library/react';

import { useRealtimeChannel } from '@/lib/realtime/useRealtimeChannel';

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';
type BroadcastHandler = (event: { payload: unknown }) => void;
type SubscribeHandler = (status: RealtimeStatus) => void;

class MockRealtimeChannel {
  private readonly broadcastHandlers: BroadcastHandler[] = [];
  private subscribeHandler: SubscribeHandler | null = null;

  public readonly on = jest.fn(
    (type: string, _filter: Record<string, unknown>, handler: BroadcastHandler) => {
      if (type === 'broadcast') {
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

  emitStatus(status: RealtimeStatus) {
    this.subscribeHandler?.(status);
  }

  emitMessage(payload: unknown) {
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
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@/lib/supabase/client';

const mockCreateClient = createClient as jest.Mock;

function getLastChannel(): MockRealtimeChannel {
  const channel = mockChannels.at(-1);

  if (!channel) {
    throw new Error('Expected a realtime channel to be created.');
  }

  return channel;
}

async function advanceTimers(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('useRealtimeChannel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockChannels.length = 0;

    mockCreateClient.mockReturnValue({
      channel: mockChannelFactory,
      removeChannel: mockRemoveChannel,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shares a pooled realtime channel between subscribers using the same channel name', () => {
    const firstOnMessage = jest.fn();
    const secondOnMessage = jest.fn();

    const firstHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'scrape-jobs',
        onMessage: firstOnMessage,
        autoConnect: false,
      }),
    );
    const secondHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'scrape-jobs',
        onMessage: secondOnMessage,
        autoConnect: false,
      }),
    );

    act(() => {
      firstHook.result.current.connect();
      secondHook.result.current.connect();
    });

    expect(mockChannelFactory).toHaveBeenCalledTimes(1);

    const sharedChannel = getLastChannel();

    act(() => {
      sharedChannel.emitStatus('SUBSCRIBED');
      sharedChannel.emitMessage({ jobId: 'job-1', status: 'running' });
    });

    expect(firstHook.result.current.connectionState).toBe('connected');
    expect(secondHook.result.current.connectionState).toBe('connected');
    expect(firstOnMessage).toHaveBeenCalledWith({ jobId: 'job-1', status: 'running' });
    expect(secondOnMessage).toHaveBeenCalledWith({ jobId: 'job-1', status: 'running' });
  });

  it('tracks connecting, connected, disconnected, and error connection states', () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'runner-presence',
        onMessage: jest.fn(),
        onError,
        autoConnect: false,
      }),
    );

    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.lastError).toBeNull();
    expect(result.current.reconnectAttempt).toBe(0);

    act(() => {
      result.current.connect();
    });

    expect(result.current.connectionState).toBe('connecting');

    const channel = getLastChannel();

    act(() => {
      channel.emitStatus('SUBSCRIBED');
    });

    expect(result.current.connectionState).toBe('connected');

    act(() => {
      channel.emitStatus('CHANNEL_ERROR');
    });

    expect(result.current.connectionState).toBe('error');
    expect(result.current.lastError).toBeInstanceOf(Error);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connectionState).toBe('disconnected');
  });

  it('retries channel errors with exponential backoff', async () => {
    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'job-broadcast',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );

    act(() => {
      result.current.connect();
    });

    const initialChannel = getLastChannel();

    act(() => {
      initialChannel.emitStatus('CHANNEL_ERROR');
    });

    expect(result.current.connectionState).toBe('error');
    expect(result.current.reconnectAttempt).toBe(1);

    await advanceTimers(999);
    expect(mockChannelFactory).toHaveBeenCalledTimes(1);

    await advanceTimers(1);
    expect(mockChannelFactory).toHaveBeenCalledTimes(2);

    const secondChannel = getLastChannel();

    act(() => {
      secondChannel.emitStatus('CHANNEL_ERROR');
    });

    expect(result.current.reconnectAttempt).toBe(2);

    await advanceTimers(1999);
    expect(mockChannelFactory).toHaveBeenCalledTimes(2);

    await advanceTimers(1);
    expect(mockChannelFactory).toHaveBeenCalledTimes(3);
  });

  it('cleans up pooled subscriptions on unmount and removes the channel when the last subscriber leaves', () => {
    const firstHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'shared-channel',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );
    const secondHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'shared-channel',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );

    act(() => {
      firstHook.result.current.connect();
      secondHook.result.current.connect();
    });

    const sharedChannel = getLastChannel();

    firstHook.unmount();
    expect(mockRemoveChannel).not.toHaveBeenCalled();

    secondHook.unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    expect(mockRemoveChannel).toHaveBeenCalledWith(sharedChannel);
  });

  it('stops reconnecting after five attempts and exposes the last error', async () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'retry-limit',
        onMessage: jest.fn(),
        onError,
        autoConnect: false,
      }),
    );

    act(() => {
      result.current.connect();
    });

    const delays = [1000, 2000, 4000, 8000, 16000];
    let activeChannel = getLastChannel();

    for (const [index, delay] of delays.entries()) {
      act(() => {
        activeChannel.emitStatus('CHANNEL_ERROR');
      });

      expect(result.current.reconnectAttempt).toBe(index + 1);

      await advanceTimers(delay);
      activeChannel = getLastChannel();
    }

    const channelCountBeforeOverflow = mockChannelFactory.mock.calls.length;

    act(() => {
      activeChannel.emitStatus('CHANNEL_ERROR');
    });

    expect(result.current.connectionState).toBe('error');
    expect(result.current.reconnectAttempt).toBe(5);
    expect(result.current.lastError).toBeInstanceOf(Error);

    await advanceTimers(60000);

    expect(mockChannelFactory).toHaveBeenCalledTimes(channelCountBeforeOverflow);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('creates separate channels for different channel names', () => {
    const onMessage1 = jest.fn();
    const onMessage2 = jest.fn();

    const firstHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'channel-alpha',
        onMessage: onMessage1,
        autoConnect: false,
      }),
    );
    const secondHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'channel-beta',
        onMessage: onMessage2,
        autoConnect: false,
      }),
    );

    act(() => {
      firstHook.result.current.connect();
      secondHook.result.current.connect();
    });

    expect(mockChannelFactory).toHaveBeenCalledTimes(2);
    expect(mockChannelFactory.mock.calls[0][0]).toBe('channel-alpha');
    expect(mockChannelFactory.mock.calls[1][0]).toBe('channel-beta');

    const channelAlpha = mockChannels[0];
    const channelBeta = mockChannels[1];

    act(() => {
      channelAlpha.emitStatus('SUBSCRIBED');
      channelBeta.emitStatus('SUBSCRIBED');
    });

    expect(firstHook.result.current.connectionState).toBe('connected');
    expect(secondHook.result.current.connectionState).toBe('connected');

    act(() => {
      channelAlpha.emitMessage({ data: 'from-alpha' });
      channelBeta.emitMessage({ data: 'from-beta' });
    });

    expect(onMessage1).toHaveBeenCalledWith({ data: 'from-alpha' });
    expect(onMessage2).toHaveBeenCalledWith({ data: 'from-beta' });
    expect(onMessage1).not.toHaveBeenCalledWith({ data: 'from-beta' });
    expect(onMessage2).not.toHaveBeenCalledWith({ data: 'from-alpha' });
  });

  it('handles rapid connect and disconnect cycles', () => {
    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'rapid-cycle',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );

    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.connect();
      });
      expect(result.current.connectionState).toBe('connecting');

      act(() => {
        result.current.disconnect();
      });
      expect(result.current.connectionState).toBe('disconnected');
    }

    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('handles cleanup during reconnection attempt', async () => {
    const { result, unmount } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'cleanup-reconnect',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );

    act(() => {
      result.current.connect();
    });

    const firstChannel = getLastChannel();

    act(() => {
      firstChannel.emitStatus('CHANNEL_ERROR');
    });

    expect(result.current.connectionState).toBe('error');
    expect(result.current.reconnectAttempt).toBe(1);

    unmount();

    await advanceTimers(1500);

    mockChannelFactory.mock.calls.length;
  });

  it('maintains state consistency after rapid state changes', async () => {
    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'state-consistency',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );

    act(() => {
      result.current.connect();
    });

    const channel = getLastChannel();

    act(() => {
      channel.emitStatus('SUBSCRIBED');
      channel.emitStatus('SUBSCRIBED');
      channel.emitStatus('SUBSCRIBED');
    });

    expect(result.current.connectionState).toBe('connected');
    expect(result.current.lastError).toBeNull();

    act(() => {
      channel.emitStatus('CLOSED');
      channel.emitStatus('CLOSED');
    });

    expect(result.current.connectionState).toBe('disconnected');
  });

  it('propagates onError callback correctly for CHANNEL_ERROR', () => {
    const onError = jest.fn();
    const onMessage = jest.fn();

    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'error-propagation',
        onMessage,
        onError,
        autoConnect: false,
      }),
    );

    act(() => {
      result.current.connect();
    });

    const channel = getLastChannel();

    act(() => {
      channel.emitStatus('CHANNEL_ERROR');
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(result.current.lastError).toBeInstanceOf(Error);
  });

  it('propagates onError callback correctly for TIMED_OUT status', () => {
    const onError = jest.fn();
    const onMessage = jest.fn();

    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'timeout-propagation',
        onMessage,
        onError,
        autoConnect: false,
      }),
    );

    act(() => {
      result.current.connect();
    });

    const channel = getLastChannel();

    act(() => {
      channel.emitStatus('TIMED_OUT');
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(result.current.lastError).toBeInstanceOf(Error);
    expect(result.current.lastError?.message).toBe('Realtime channel timed out.');
  });

  it('does not call onError for CLOSED status', () => {
    const onError = jest.fn();
    const onMessage = jest.fn();

    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'closed-status',
        onMessage,
        onError,
        autoConnect: false,
      }),
    );

    act(() => {
      result.current.connect();
    });

    const channel = getLastChannel();

    act(() => {
      channel.emitStatus('CLOSED');
    });

    expect(onError).not.toHaveBeenCalled();
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('handles rapid reconnection with multiple subscribers', async () => {
    const onError1 = jest.fn();
    const onError2 = jest.fn();

    const firstHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'multi-reconnect',
        onMessage: jest.fn(),
        onError: onError1,
        autoConnect: false,
      }),
    );
    const secondHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'multi-reconnect',
        onMessage: jest.fn(),
        onError: onError2,
        autoConnect: false,
      }),
    );

    act(() => {
      firstHook.result.current.connect();
      secondHook.result.current.connect();
    });

    const sharedChannel = getLastChannel();

    act(() => {
      sharedChannel.emitStatus('CHANNEL_ERROR');
    });

    expect(firstHook.result.current.connectionState).toBe('error');
    expect(secondHook.result.current.connectionState).toBe('error');
    expect(onError1).toHaveBeenCalled();
    expect(onError2).toHaveBeenCalled();

    await advanceTimers(1000);

    const secondChannel = getLastChannel();

    act(() => {
      secondChannel.emitStatus('CHANNEL_ERROR');
    });

    expect(firstHook.result.current.reconnectAttempt).toBe(2);
    expect(secondHook.result.current.reconnectAttempt).toBe(2);

    await advanceTimers(2000);

    expect(mockChannelFactory).toHaveBeenCalledTimes(3);
  });

  it('handles subscriber count correctly when subscribers join and leave', () => {
    const firstHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'refcount-test',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );
    const secondHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'refcount-test',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );
    const thirdHook = renderHook(() =>
      useRealtimeChannel({
        channelName: 'refcount-test',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );

    act(() => {
      firstHook.result.current.connect();
    });
    act(() => {
      secondHook.result.current.connect();
    });
    act(() => {
      thirdHook.result.current.connect();
    });

    expect(mockChannelFactory).toHaveBeenCalledTimes(1);

    secondHook.unmount();
    expect(mockRemoveChannel).not.toHaveBeenCalled();

    thirdHook.unmount();
    expect(mockRemoveChannel).not.toHaveBeenCalled();

    firstHook.unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('respects autoConnect option when true', () => {
    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'auto-connect-test',
        onMessage: jest.fn(),
        autoConnect: true,
      }),
    );

    expect(result.current.connectionState).toBe('connecting');

    const channel = getLastChannel();

    act(() => {
      channel.emitStatus('SUBSCRIBED');
    });

    expect(result.current.connectionState).toBe('connected');
  });

  it('respects autoConnect option when false', () => {
    const { result } = renderHook(() =>
      useRealtimeChannel({
        channelName: 'manual-connect-test',
        onMessage: jest.fn(),
        autoConnect: false,
      }),
    );

    expect(result.current.connectionState).toBe('disconnected');

    act(() => {
      result.current.connect();
    });

    expect(result.current.connectionState).toBe('connecting');
  });
});
