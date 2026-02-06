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

interface HeartbeatRequest {
    runner_name?: string;
    status?: 'idle' | 'busy' | 'polling';
    current_job_id?: string;
    lease_token?: string;
    jobs_completed?: number;
    memory_usage_mb?: number;
}

export async function POST(request: NextRequest) {
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

        const body: HeartbeatRequest = await request.json();
        // Always use the authenticated runner name, ignoring what the runner claims in the body
        const runnerName = runner.runnerName;
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();
        let leaseExpiresAt: string | null = null;

        if (body.current_job_id) {
            const { data: job, error: jobError } = await supabase
                .from('scrape_jobs')
                .select('id, status, lease_token, runner_name')
                .eq('id', body.current_job_id)
                .single();

            if (jobError || !job) {
                return NextResponse.json(
                    { error: 'Current job not found' },
                    { status: 404 }
                );
            }

            if (job.runner_name && job.runner_name !== runnerName) {
                return NextResponse.json(
                    { error: 'Runner does not own current job' },
                    { status: 409 }
                );
            }

            if (job.lease_token && body.lease_token !== job.lease_token) {
                return NextResponse.json(
                    { error: 'Lease token mismatch' },
                    { status: 409 }
                );
            }

            if (job.status !== 'running') {
                return NextResponse.json(
                    { error: 'Current job is not running' },
                    { status: 409 }
                );
            }

            leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

            const { error: jobUpdateError } = await supabase
                .from('scrape_jobs')
                .update({
                    heartbeat_at: nowIso,
                    lease_expires_at: leaseExpiresAt,
                    updated_at: nowIso,
                })
                .eq('id', body.current_job_id);

            if (jobUpdateError) {
                console.error(`[Heartbeat] Failed to update job heartbeat ${body.current_job_id}:`, jobUpdateError);
                return NextResponse.json(
                    { error: 'Failed to update job heartbeat' },
                    { status: 500 }
                );
            }
        }

        const updatePayload: Record<string, unknown> = {
            last_seen_at: nowIso,
            status: body.status || 'idle',
        };

        if (body.current_job_id !== undefined) {
            updatePayload.current_job_id = body.current_job_id;
        }
        if (body.jobs_completed !== undefined) {
            updatePayload.jobs_completed = body.jobs_completed;
        }
        if (body.memory_usage_mb !== undefined) {
            updatePayload.memory_usage_mb = body.memory_usage_mb;
        }

        const { error } = await supabase
            .from('scraper_runners')
            .update(updatePayload)
            .eq('name', runnerName);

        if (error) {
            console.error(`[Heartbeat] Failed to update runner ${runnerName}:`, error);
            return NextResponse.json(
                { error: 'Failed to update heartbeat' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            acknowledged: true,
            timestamp: nowIso,
            enforced_runner_name: runnerName,
            lease_expires_at: leaseExpiresAt,
        });
    } catch (error) {
        console.error('[Heartbeat] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
