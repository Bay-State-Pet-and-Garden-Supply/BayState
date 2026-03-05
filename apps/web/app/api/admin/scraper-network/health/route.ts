import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface ConfigCheck {
    name: string;
    status: 'ok' | 'error' | 'warning';
    message: string;
}

/**
 * GET /api/admin/scraper-network/health
 * 
 * Returns health status of the scraper network infrastructure.
 * Checks for available daemon runners and valid API keys.
 */
export async function GET() {
    const checks: ConfigCheck[] = [];
    const supabase = await createClient();

    // Check 1: API Key Authentication
    checks.push({
        name: 'Runner Auth',
        status: 'ok',
        message: 'API Key authentication (X-API-Key header)',
    });

    // Check 2: Database connectivity (implicit via runner query)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: activeRunners, error: runnerError } = await supabase
        .from('scraper_runners')
        .select('name, status, last_seen_at')
        .gt('last_seen_at', fiveMinutesAgo)
        .in('status', ['online', 'polling', 'idle', 'running']);

    if (runnerError) {
        checks.push({
            name: 'Database',
            status: 'error',
            message: `Failed to query runners: ${runnerError.message}`,
        });
    } else {
        checks.push({
            name: 'Database',
            status: 'ok',
            message: 'Connected to Supabase',
        });
    }

    // Check 3: Active daemon runners
    const runnerCount = activeRunners?.length || 0;
    if (runnerCount > 0) {
        const runnerNames = activeRunners?.map(r => r.name).join(', ') || '';
        checks.push({
            name: 'Daemon Runners',
            status: 'ok',
            message: `${runnerCount} runner(s) active: ${runnerNames}`,
        });
    } else {
        checks.push({
            name: 'Daemon Runners',
            status: 'warning',
            message: 'No active runners. Jobs will queue until a runner connects.',
        });
    }

    // Check 4: Valid API keys exist
    const { count: keyCount, error: keyError } = await supabase
        .from('runner_api_keys')
        .select('*', { count: 'exact', head: true })
        .is('revoked_at', null);

    if (keyError) {
        checks.push({
            name: 'API Keys',
            status: 'error',
            message: `Failed to query API keys: ${keyError.message}`,
        });
    } else if ((keyCount || 0) > 0) {
        checks.push({
            name: 'API Keys',
            status: 'ok',
            message: `${keyCount} active API key(s) configured`,
        });
    } else {
        checks.push({
            name: 'API Keys',
            status: 'warning',
            message: 'No API keys configured. Create one to enable runner authentication.',
        });
    }

    // Check 5: Pending jobs count
    const { count: pendingJobs } = await supabase
        .from('scrape_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    checks.push({
        name: 'Job Queue',
        status: (pendingJobs || 0) > 10 ? 'warning' : 'ok',
        message: `${pendingJobs || 0} pending job(s)`,
    });

    return NextResponse.json({ checks });
}
