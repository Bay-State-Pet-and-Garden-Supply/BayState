/**
 * Runner Network Actions
 *
 * Server actions for managing scraper runners in the admin panel.
 */

'use server';

import { createClient } from '@supabase/supabase-js';
import type { RunnerPresence } from '@/lib/realtime/types';

/**
 * Fetch all runners from the database for the admin dashboard.
 * Returns runners converted to RunnerPresence format for display.
 */
export async function getAllRunners(): Promise<RunnerPresence[]> {
    // Use service role to bypass RLS for admin dashboard
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );

    // Fetch all runners from the database
    const { data: runners, error } = await supabase
        .from('scraper_runners')
        .select('name, status, last_seen_at, current_job_id, metadata, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[getAllRunners] Failed to fetch runners:', error);
        throw new Error('Failed to fetch runners');
    }

    // Convert database records to RunnerPresence format
    const presenceRunners: RunnerPresence[] = (runners || []).map((runner) => {
        // Map database status to presence status
        let status: RunnerPresence['status'] = 'offline';
        if (runner.status === 'online') {
            status = 'idle'; // Online but no active job
        } else if (runner.status === 'busy' || runner.current_job_id) {
            status = 'busy';
        } else if (runner.status === 'offline') {
            status = 'offline';
        } else if (runner.status === 'idle') {
            status = 'idle';
        }

        return {
            runner_id: runner.name, // Use name as unique identifier
            runner_name: runner.name,
            status,
            active_jobs: runner.current_job_id ? 1 : 0,
            last_seen: runner.last_seen_at || runner.created_at,
            metadata: runner.metadata as Record<string, unknown> | undefined,
        };
    });

    return presenceRunners;
}
