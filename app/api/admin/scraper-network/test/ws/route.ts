/**
 * WebSocket Endpoint for Test Lab Real-Time Updates
 *
 * This endpoint provides WebSocket connection configuration for real-time updates.
 * The actual WebSocket server runs as a separate process.
 *
 * GET /api/admin/scraper-network/test/ws?test_run_id=xxx
 * Returns WebSocket connection info and subscription details
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/scraper-network/test/ws
 *
 * Returns WebSocket connection information for real-time test lab updates.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const testRunId = searchParams.get('test_run_id');
        const jobId = searchParams.get('job_id');

        // WebSocket URL - can be configured via environment
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

        return NextResponse.json({
            success: true,
            connection: {
                url: `${wsUrl}`,
                path: '/ws/test-lab',
                protocols: [],
            },
            events: [
                'test_lab.selector.validation',
                'test_lab.login.status',
                'test_lab.extraction.result',
                'test.progress',
                'test.completed',
            ],
            subscriptions: {
                test: testRunId ? `test:${testRunId}` : null,
                job: jobId ? `job:${jobId}` : null,
            },
            auth: {
                type: 'api_key',
                header: 'x-api-key',
            },
            reconnection: {
                enabled: true,
                maxAttempts: 5,
                delay: 1000,
                maxDelay: 30000,
            },
        });
    } catch (error) {
        console.error('[TestLab WS API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get WebSocket configuration' },
            { status: 500 }
        );
    }
}
