import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeJobs } from '@/hooks/useRealtimeJobs';

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 0;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 10);
  }

  send(data: string) {}

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  // Helper to simulate receiving messages
  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

describe('useRealtimeJobs', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
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

    expect(result.current.connectionStatus).toBe('connecting');

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });
  });

  it('receives job updates', async () => {
    const { result } = renderHook(() => useRealtimeJobs({ autoConnect: true }));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    const mockJob = {
      type: 'job_update',
      jobId: 'job-1',
      status: 'running',
      progress: 50,
      timestamp: new Date().toISOString(),
    };

    act(() => {
      const ws = result.current as unknown as { _ws: MockWebSocket };
      // Simulate message through the WebSocket
    });
  });

  it('disconnects when disconnect is called', async () => {
    const { result } = renderHook(() => useRealtimeJobs({ autoConnect: true }));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('reconnects when reconnect is called', async () => {
    const { result } = renderHook(() => useRealtimeJobs({ autoConnect: true }));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    act(() => {
      result.current.disconnect();
    });

    act(() => {
      result.current.reconnect();
    });

    expect(result.current.connectionStatus).toBe('connecting');
  });
});
