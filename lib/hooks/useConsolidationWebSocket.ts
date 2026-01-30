import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Event Types for Consolidation
export interface ConsolidationProgressEvent {
    batchId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number; // 0-100
    totalProducts: number;
    processedProducts: number;
    successfulProducts: number;
    failedProducts: number;
    estimatedTimeRemaining?: number; // seconds
    timestamp: number;
}

export interface ConsolidationCompleteEvent {
    batchId: string;
    status: 'completed' | 'failed';
    totalProducts: number;
    successfulProducts: number;
    failedProducts: number;
    durationMs: number;
    timestamp: number;
}

// Hook Return Type
export interface UseConsolidationWebSocketReturn {
    isConnected: boolean;
    isConnecting: boolean;
    lastError: Error | null;
    connect: () => void;
    disconnect: () => void;
    subscribeToBatch: (batchId: string) => void;
    unsubscribeFromBatch: (batchId: string) => void;
    lastProgressEvent: ConsolidationProgressEvent | null;
}

export function useConsolidationWebSocket(
    url: string = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:3001',
    apiKey: string = process.env.NEXT_PUBLIC_API_KEY || ''
): UseConsolidationWebSocketReturn {
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [lastError, setLastError] = useState<Error | null>(null);

    // State for events
    const [lastProgressEvent, setLastProgressEvent] = useState<ConsolidationProgressEvent | null>(null);

    const connect = useCallback(() => {
        if (socketRef.current?.connected) return;

        setIsConnecting(true);
        setLastError(null);

        const socket = io(url, {
            auth: {
                token: apiKey,
            },
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            setIsConnecting(false);
            setLastError(null);
            console.log('Consolidation WebSocket connected');
        });

        socket.on('disconnect', (reason) => {
            setIsConnected(false);
            setIsConnecting(false);
            console.log('Consolidation WebSocket disconnected:', reason);
        });

        socket.on('connect_error', (err) => {
            setIsConnecting(false);
            setLastError(err);
            console.error('Consolidation WebSocket connection error:', err);
        });

        // Progress events
        socket.on('consolidation.progress', (data: ConsolidationProgressEvent) => {
            setLastProgressEvent({ ...data, timestamp: Date.now() });
        });

        // Completion events
        socket.on('consolidation.completed', (data: ConsolidationCompleteEvent) => {
            console.log('Consolidation completed:', data);
        });

        socket.on('consolidation.failed', (data: ConsolidationCompleteEvent) => {
            console.error('Consolidation failed:', data);
        });

    }, [url, apiKey]);

    const disconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
            setIsConnected(false);
            setIsConnecting(false);
        }
    }, []);

    const subscribeToBatch = useCallback((batchId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('subscribe', { room: `consolidation:${batchId}` });
            console.log('Subscribed to consolidation batch:', batchId);
        } else {
            console.warn('Cannot subscribe: Socket not connected');
        }
    }, []);

    const unsubscribeFromBatch = useCallback((batchId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('unsubscribe', { room: `consolidation:${batchId}` });
            console.log('Unsubscribed from consolidation batch:', batchId);
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        isConnected,
        isConnecting,
        lastError,
        connect,
        disconnect,
        subscribeToBatch,
        unsubscribeFromBatch,
        lastProgressEvent,
    };
}
