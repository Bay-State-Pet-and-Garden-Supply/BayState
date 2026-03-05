import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}

/**
 * POST /api/admin/scraper-network/runners/register
 * 
 * Registers a new runner or updates an existing one.
 * Called by the runner CLI during setup to verify credentials
 * and register the runner with the coordinator.
 * 
 * Supports API Key authentication (preferred) or legacy JWT.
 */
export async function POST(request: NextRequest) {
    try {
        // Validate authentication using unified auth function
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            return NextResponse.json(
                { error: 'Unauthorized - invalid or missing authentication' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { runner_name, metadata = {} } = body;

        if (!runner_name || typeof runner_name !== 'string') {
            return NextResponse.json(
                { error: 'runner_name is required' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        // Upsert the runner record
        const { data: runnerRecord, error: upsertError } = await supabase
            .from('scraper_runners')
            .upsert(
                {
                    name: runner_name,
                    last_seen_at: new Date().toISOString(),
                    status: 'online',
                    metadata: {
                        ...metadata,
                        registered_at: new Date().toISOString(),
                        auth_method: runner.authMethod,
                    },
                },
                {
                    onConflict: 'name',
                    ignoreDuplicates: false,
                }
            )
            .select()
            .single();

        if (upsertError) {
            console.error('[Runner Register] Upsert error:', upsertError);
            return NextResponse.json(
                { error: 'Failed to register runner', details: upsertError.message },
                { status: 500 }
            );
        }

        console.log(`[Runner Register] Runner '${runner_name}' registered via ${runner.authMethod}`);

        return NextResponse.json({
            success: true,
            runner: {
                name: runnerRecord.name,
                status: runnerRecord.status,
                registered_at: runnerRecord.metadata?.registered_at,
            },
            message: `Runner '${runner_name}' registered successfully`,
        });
    } catch (error) {
        console.error('[Runner Register] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/admin/scraper-network/runners/register
 * 
 * Validates runner credentials without registering.
 * Used by CLI to test authentication.
 */
export async function GET(request: NextRequest) {
    try {
        // Validate authentication using unified auth function
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            return NextResponse.json(
                { valid: false, error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        return NextResponse.json({
            valid: true,
            runner_name: runner.runnerName,
            auth_method: runner.authMethod,
        });
    } catch (error) {
        console.error('[Runner Register] Validation error:', error);
        return NextResponse.json(
            { valid: false, error: 'Validation failed' },
            { status: 500 }
        );
    }
}
