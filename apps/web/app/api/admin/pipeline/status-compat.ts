import {
  PERSISTED_PIPELINE_STATUSES,
  type PersistedPipelineStatus,
} from '@/lib/pipeline/types';

const LEGACY_ROUTE_STATUS_MAP = {
  registered: 'imported',
  // Migration mappings: old → new simplified statuses
  scraped: 'processed',
  consolidating: 'merging',
  finalizing: 'reviewing',
  exporting: 'publishing',
  searching: 'imported',
  scraping: 'extracting',
  extracting: 'imported',
} as const satisfies Record<string, PersistedPipelineStatus>;

export const PIPELINE_ROUTE_STATUS_VALUES = [
  ...PERSISTED_PIPELINE_STATUSES,
  ...Object.keys(LEGACY_ROUTE_STATUS_MAP),
  'all',
] as const;

export type PipelineRouteStatus = PersistedPipelineStatus | 'all';

export function normalizePipelineRouteStatus(
  rawStatus: string,
  routeName: string
): PipelineRouteStatus | null {
  if (rawStatus === 'all') {
    return rawStatus;
  }

  if ((PERSISTED_PIPELINE_STATUSES as readonly string[]).includes(rawStatus)) {
    return rawStatus as PersistedPipelineStatus;
  }

  const mappedStatus = LEGACY_ROUTE_STATUS_MAP[rawStatus as keyof typeof LEGACY_ROUTE_STATUS_MAP];
  if (!mappedStatus) {
    return null;
  }

  console.warn(
    `[pipeline-status-compat] ${routeName} mapped legacy status '${rawStatus}' to canonical '${mappedStatus}'`
  );

  return mappedStatus;
}
