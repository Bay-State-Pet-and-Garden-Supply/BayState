import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  coerceRunnerMetadata,
  getEffectiveRunnerStatus,
  getRunnerBuildCheckReason,
  getRunnerConnectivityStatus,
  getRunnerLabels,
  getRunnerLastSeen,
  getRunnerOs,
  getRunnerVersion,
} from '@/lib/scraper-runners';

export const dynamic = 'force-dynamic';

interface RunnerData {
  name: string;
  last_seen_at: string | null;
  created_at: string | null;
  status: string | null;
  current_job_id: string | null;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: runnersData, error } = await supabase
      .from('scraper_runners')
      .select('name,last_seen_at,created_at,status,current_job_id,enabled,metadata')
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw error;
    }

    const runners = ((runnersData ?? []) as RunnerData[]).map((runner) => {
      const metadata = coerceRunnerMetadata(runner.metadata);
      const durableStatus = getEffectiveRunnerStatus(runner);
      const status = getRunnerConnectivityStatus(durableStatus);
      const version = getRunnerVersion(metadata);
      const buildCheckReason = getRunnerBuildCheckReason(metadata);

      return {
        id: runner.name,
        name: runner.name,
        os: getRunnerOs(metadata),
        status,
        raw_status: durableStatus,
        busy: durableStatus === 'busy',
        labels: getRunnerLabels(metadata).map((name) => ({ name })),
        last_seen: getRunnerLastSeen(runner),
        active_jobs: runner.current_job_id ? 1 : 0,
        enabled: runner.enabled,
        version,
        build_check_reason: buildCheckReason,
        metadata,
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
