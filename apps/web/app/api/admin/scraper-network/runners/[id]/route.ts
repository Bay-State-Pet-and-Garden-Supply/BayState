import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

async function getAuthenticatedUser() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
            },
        }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

interface RunnerStats {
    total_runs: number;
    success_rate: number;
    avg_duration_seconds: number;
}

interface RunnerResponse {
    id: string;
    name: string;
    status: 'online' | 'offline' | 'busy' | 'idle' | 'polling';
    last_seen_at: string;
    last_seen_relative: string;
    current_job_id: string | null;
    metadata: Record<string, unknown>;
    stats: RunnerStats;
}

/**
 * GET /api/admin/scraper-network/runners/[id]
 * 
 * Get a single runner by ID with related statistics.
 * Returns 404 if runner not found.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const admin = getSupabaseAdmin();

        // Fetch the runner
        const { data: runner, error } = await admin
            .from('scraper_runners')
            .select('*')
            .eq('name', id)
            .single();

        if (error || !runner) {
            return NextResponse.json({ error: 'Runner not found' }, { status: 404 });
        }

        // Calculate status based on last_seen_at
        const now = new Date();
        const lastSeen = new Date(runner.last_seen_at);
        const minutesSinceSeen = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

        let status: RunnerResponse['status'] = runner.status;
        if (minutesSinceSeen > 5) {
            status = 'offline';
        }

        // Calculate relative time string
        const relativeTime = getRelativeTimeString(minutesSinceSeen);

        // Fetch stats from scrape_jobs
        const { data: statsData, error: statsError } = await admin
            .from('scrape_jobs')
            .select('status, duration_ms, created_at')
            .eq('runner_name', id);

        let stats: RunnerStats = {
            total_runs: 0,
            success_rate: 0,
            avg_duration_seconds: 0
        };

        if (!statsError && statsData && statsData.length > 0) {
            const completed = statsData.filter(j => j.status === 'completed');
            const failed = statsData.filter(j => j.status === 'failed');
            const successful = statsData.filter(j => j.status === 'success');

            const totalDuration = statsData.reduce((sum, j) => sum + (j.duration_ms || 0), 0);

            stats = {
                total_runs: statsData.length,
                success_rate: statsData.length > 0 
                    ? Math.round(((successful.length + completed.length) / statsData.length) * 100) 
                    : 0,
                avg_duration_seconds: statsData.length > 0 
                    ? Math.round(totalDuration / statsData.length / 1000) 
                    : 0
            };
        }

        const response: RunnerResponse = {
            id: runner.name,
            name: runner.name,
            status,
            last_seen_at: runner.last_seen_at,
            last_seen_relative: relativeTime,
            current_job_id: runner.current_job_id,
            metadata: runner.metadata || {},
            stats
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('[Runner Detail API] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch runner' },
            { status: 500 }
        );
    }
}

function getRelativeTimeString(minutesSinceSeen: number): string {
    if (minutesSinceSeen < 1) {
        return 'Just now';
    } else if (minutesSinceSeen < 60) {
        const mins = Math.round(minutesSinceSeen);
        return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
    } else if (minutesSinceSeen < 1440) {
        const hours = Math.round(minutesSinceSeen / 60);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
        const days = Math.round(minutesSinceSeen / 1440);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
}
