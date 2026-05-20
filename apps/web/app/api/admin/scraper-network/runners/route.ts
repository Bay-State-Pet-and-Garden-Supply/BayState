import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  coerceRunnerMetadata,
  getEffectiveRunnerStatus,
  getRunnerBuildCheckReason,
  getRunnerConnectivityStatus,
  getRunnerLabels,
  getRunnerLastSeen,
  getRunnerOs,
  getRunnerVersion,
  type ScraperRunnerRow,
} from '@/lib/scraper-runners';

export const dynamic = 'force-dynamic';

type RunnerData = Pick<
  ScraperRunnerRow,
  'name' | 'last_seen_at' | 'created_at' | 'status' | 'current_job_id' | 'enabled' | 'metadata'
>;

export async function GET() {
  try {
    const supabase = await createAdminClient();
    const { data: runnersData, error } = await supabase
      .from('scraper_runners')
      .select('name,last_seen_at,created_at,status,current_job_id,enabled,metadata')
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Load the latest expected runner release to perform a live check for staleness
    const { data: latestReleaseData } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'scraper_runner_release_latest')
      .maybeSingle();
    
    const latestRelease = latestReleaseData?.value as any;
    const latestBuildId = latestRelease?.build_id;
    const latestBuildSha = latestRelease?.digest?.replace(/^sha256:/, '') || latestRelease?.build_sha;

    const runners = ((runnersData ?? []) as RunnerData[]).map((runner) => {
      const metadata = coerceRunnerMetadata(runner.metadata) || {};
      const durableStatus = getEffectiveRunnerStatus(runner);
      const status = getRunnerConnectivityStatus(durableStatus);
      const version = getRunnerVersion(metadata);
      
      const runnerBuildId = metadata.build_id as string | undefined;
      let buildCheckReason = getRunnerBuildCheckReason(metadata);

      // Perform a live check for staleness if we have latest info
      if (latestBuildId && runnerBuildId && runnerBuildId !== latestBuildId) {
        buildCheckReason = 'outdated';
      }

      // Build an effective metadata object that contains the actual latest version info
      const effectiveMetadata = {
        ...metadata,
        latest_build_id: latestBuildId ?? metadata.latest_build_id,
        latest_build_sha: latestBuildSha ?? metadata.latest_build_sha,
        build_check_reason: buildCheckReason,
        build_compatible: buildCheckReason === 'current' || buildCheckReason === 'unconfigured',
      };

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
        metadata: effectiveMetadata,
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
