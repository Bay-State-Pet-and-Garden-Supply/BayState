import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface RunnerData {
  name: string;
  last_seen_at: string | null;
  status: 'online' | 'offline' | 'busy' | 'idle' | 'polling' | 'paused';
  current_job_id: string | null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: runnersData, error } = await supabase
      .from('scraper_runners')
      .select('name,last_seen_at,status,current_job_id')
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw error;
    }

    const now = new Date();
    const runners = ((runnersData ?? []) as RunnerData[]).map((runner) => {
      const lastSeenAt = runner.last_seen_at ? new Date(runner.last_seen_at) : null;
      const minutesSinceSeen = lastSeenAt
        ? (now.getTime() - lastSeenAt.getTime()) / 1000 / 60
        : Number.POSITIVE_INFINITY;
      const status = minutesSinceSeen > 5 || runner.status === 'offline' ? 'offline' : 'online';

      return {
        id: runner.name,
        name: runner.name,
        os: 'Linux/Mac',
        status,
        busy: runner.status === 'busy',
        labels: [],
        last_seen: runner.last_seen_at ?? new Date(0).toISOString(),
        active_jobs: runner.current_job_id ? 1 : 0,
      };
    });

    const onlineCount = runners.filter((runner) => runner.status === 'online').length;
    const offlineCount = runners.filter((runner) => runner.status === 'offline').length;

    return NextResponse.json({
      runners,
      available: true,
      onlineCount,
      offlineCount,
    });
  } catch (error) {
    console.error('[Runners API] Error:', error);
    return NextResponse.json(
      {
        runners: [],
        available: false,
        error: error instanceof Error ? error.message : 'Failed to fetch runners',
      },
      { status: 500 },
    );
  }
}
