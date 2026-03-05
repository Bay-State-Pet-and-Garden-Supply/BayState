/**
 * WebSocket Endpoint for Test Lab Real-Time Updates (DEPRECATED)
 *
 * This endpoint is DEPRECATED. The migration to Supabase Realtime is complete.
 * Real-time updates now use Supabase Realtime (postgres_changes) instead of WebSocket.
 *
 * The WebSocket server (localhost:3001) is no longer used.
 *
 * For real-time updates, use:
 * - Frontend: useSupabaseRealtime hook
 * - Database: INSERT to scraper_selector_results, scraper_login_results, scraper_extraction_results
 *
 * This endpoint returns 410 Gone for compatibility.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/scraper-network/test/ws
 *
 * DEPRECATED - Returns 410 Gone
 */
export async function GET(request: NextRequest) {
    return NextResponse.json(
        {
            deprecated: true,
            message: 'WebSocket endpoint is deprecated. Use Supabase Realtime instead.',
            migration: 'supabase-realtime-migration-complete',
            see: 'lib/hooks/useSupabaseRealtime.ts',
        },
        { status: 410 }
    );
}
