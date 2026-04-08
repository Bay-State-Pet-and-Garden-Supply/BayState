'use client';

export type RealtimeConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseRealtimeChannelOptions {
  channelName: string;
  onMessage: (payload: unknown) => void;
  onError?: (error: Error) => void;
  autoConnect?: boolean;
}

export interface UseRealtimeChannelReturn {
  connectionState: RealtimeConnectionState;
  lastError: Error | null;
  reconnectAttempt: number;
  connect: () => void;
  disconnect: () => void;
}

export function useRealtimeChannel(_options: UseRealtimeChannelOptions): UseRealtimeChannelReturn {
  throw new Error('useRealtimeChannel is not implemented yet.');
}
