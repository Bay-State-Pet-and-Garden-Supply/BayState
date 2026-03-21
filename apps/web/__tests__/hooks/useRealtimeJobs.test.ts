import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeJobs } from '@/hooks/useRealtimeJobs';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = MockWebSocket.CONNECTING;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }

  static reset() {
    MockWebSocket.instances = [];
  }

  send(_data: string) {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Helper to simulate receiving messages
  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
window.WebSocket = MockWebSocket as unknown as typeof WebSocket;

async function flushTimers() {
  await act(async () => {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
  });
}

describe('useRealtimeJobs', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllTimers();
    MockWebSocket.reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes with disconnected status', () => {
    const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.jobs).toEqual([]);
    expect(result.current.runners).toEqual([]);
  });

  it('connects when autoConnect is true', async () => {
    const { result } = renderHook(() => useRealtimeJobs({ autoConnect: true }));

    expect(result.current.connectionStatus).toBe('disconnected');

    await flushTimers();
    await flushTimers();

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });
  });

  it('receives job updates', async () => {
    const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

    act(() => {
      result.current.connect();
    });

    expect(result.current.connectionStatus).toBe('connecting');

    await flushTimers();

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    const socket = MockWebSocket.instances.at(-1);
    expect(socket).toBeDefined();

    const mockJob = {
      type: 'job_update',
      jobId: 'job-1',
      status: 'running',
      progress: 50,
      timestamp: new Date().toISOString(),
    };

    act(() => {
      socket?.simulateMessage(mockJob);
    });

    expect(result.current.jobs).toEqual([mockJob]);
    expect(result.current.lastUpdate).toBeInstanceOf(Date);
  });

  it('disconnects when disconnect is called', async () => {
    const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

    act(() => {
      result.current.connect();
    });

    await flushTimers();

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    const initialSocketCount = MockWebSocket.instances.length;

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connectionStatus).toBe('disconnected');

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(MockWebSocket.instances).toHaveLength(initialSocketCount);
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('reconnects when reconnect is called', async () => {
    const { result } = renderHook(() => useRealtimeJobs({ autoConnect: false }));

    act(() => {
      result.current.connect();
    });

    await flushTimers();

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    const initialSocketCount = MockWebSocket.instances.length;

    act(() => {
      result.current.reconnect();
    });

    expect(result.current.connectionStatus).toBe('connecting');

    await flushTimers();

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    expect(MockWebSocket.instances).toHaveLength(initialSocketCount + 1);
  });
});
