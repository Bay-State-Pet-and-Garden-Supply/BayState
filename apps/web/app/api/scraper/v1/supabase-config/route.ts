import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY } from '@/lib/supabase/config';

function getRunnerSupabaseUrl(url: string) {
    if (
        process.env.NODE_ENV === "development" &&
        (url.includes("127.0.0.1") || url.includes("localhost"))
    ) {
        // return url
        //    .replace("127.0.0.1", "host.docker.internal")
        //    .replace("localhost", "host.docker.internal");
        return url;
    }

    return url;
}

function getSupabaseAdmin(): SupabaseClient {
    const url = SUPABASE_URL;
    const key = SUPABASE_SECRET_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration (SUPABASE_URL and SUPABASE_SECRET_KEY)');
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

        const supabaseUrl = getRunnerSupabaseUrl(SUPABASE_URL);
        // Use anon key for realtime connections (service role key is for server-side only)
        const supabaseRealtimeKey = SUPABASE_PUBLISHABLE_KEY;

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
