import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateActiveRunner } from '@/lib/scraper-auth';
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin(): SupabaseClient {
    const url = SUPABASE_URL;
    const key = SUPABASE_SECRET_KEY;
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
        const activeRunner = await validateActiveRunner(request);

        if (!activeRunner.isAuthenticated) {
            return NextResponse.json(
                { error: 'Unauthorized - invalid or missing authentication' },
                { status: 401 }
            );
        }

        if (!activeRunner.isEnabled) {
            if (activeRunner.mismatchResponse) {
                return activeRunner.mismatchResponse;
            }
            return NextResponse.json(
                { error: 'Forbidden - runner is disabled' },
                { status: 403 }
            );
        }

        const runner = activeRunner.runner!;
        const body = await request.json();
        const { runner_name, metadata = {} } = body;

        if (!runner_name || typeof runner_name !== 'string') {
            return NextResponse.json(
                { error: 'runner_name is required' },
                { status: 400 }
            );
        }

        if (runner.runnerName && runner_name !== runner.runnerName) {
            return NextResponse.json(
                { error: 'Forbidden: runner_name does not match authenticated runner name' },
                { status: 403 }
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
        const activeRunner = await validateActiveRunner(request);

        if (!activeRunner.isAuthenticated) {
            return NextResponse.json(
                { valid: false, error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        if (!activeRunner.isEnabled) {
            if (activeRunner.mismatchResponse) {
                return activeRunner.mismatchResponse;
            }
            return NextResponse.json(
                { valid: false, error: 'Forbidden - runner is disabled' },
                { status: 403 }
            );
        }

        const runner = activeRunner.runner!;

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
