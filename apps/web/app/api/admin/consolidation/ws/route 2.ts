/**
 * WebSocket Endpoint for Consolidation Real-Time Updates
 * 
 * This endpoint provides WebSocket connection configuration for real-time updates.
 * The actual WebSocket server runs as a separate process (e.g., socket.io server).
 * 
 * Events published:
 * - consolidation.progress: Progress updates during batch processing
 * - consolidation.completed: Final results when batch completes
 * - consolidation.failed: Error information when batch fails
 */

import { NextRequest, NextResponse } from 'next/server';

const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export async function GET(request: NextRequest) {
    try {
        // Get auth info
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json(
                { error: 'Missing Supabase configuration' },
                { status: 500 }
            );
        }

        // Return WebSocket connection information
        return NextResponse.json({
            wsUrl,
            events: [
                'consolidation.progress',
                'consolidation.completed',
                'consolidation.failed'
            ],
            subscriptionFormat: {
                event: 'subscribe',
                data: { room: 'consolidation:{batchId}' }
            },
            unsubscriptionFormat: {
                event: 'unsubscribe', 
                data: { room: 'consolidation:{batchId}' }
            }
        });
    } catch (error) {
        console.error('[Consolidation WS API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get WebSocket configuration' },
            { status: 500 }
        );
    }
}
