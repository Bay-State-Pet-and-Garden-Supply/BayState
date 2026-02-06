import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}

interface SupabaseConfigResponse {
    supabase_url: string;
    supabase_realtime_key: string;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseRealtimeKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseRealtimeKey) {
            console.warn(`[SupabaseConfig] Supabase not configured for runner ${runner.runnerName}`);
            return NextResponse.json(
                { error: 'Supabase not configured on server' },
                { status: 503 }
            );
        }

        console.log(`[SupabaseConfig] Providing Supabase config to runner ${runner.runnerName}`);

        return NextResponse.json({
            supabase_url: supabaseUrl,
            supabase_realtime_key: supabaseRealtimeKey,
        });
    } catch (error) {
        console.error('[SupabaseConfig] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    return GET(request);
}
