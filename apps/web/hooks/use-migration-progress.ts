'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface MigrationData {
  month: string;
  source_type: string;
  order_count: number;
}

export interface ChannelTrend {
  web: MigrationData[];
  shopsite: MigrationData[];
  integra: MigrationData[];
  manual: MigrationData[];
  import: MigrationData[];
}

function groupBySource(data: MigrationData[]): ChannelTrend {
  const grouped: ChannelTrend = { web: [], shopsite: [], integra: [], manual: [], import: [] };
  for (const row of data) {
    const key = row.source_type as keyof ChannelTrend;
    if (key in grouped) {
      grouped[key].push(row);
    }
  }
  // Sort each channel by month ascending
  for (const channel of Object.values(grouped)) {
    channel.sort((a, b) => a.month.localeCompare(b.month));
  }
  return grouped;
}

export function useMigrationProgress() {
  const [data, setData] = useState<ChannelTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const { data: rows, error: err } = await supabase
        .from('dashboard_migration_progress')
        .select('*');

      if (err) throw err;

      setData(groupBySource(rows ?? []));
    } catch (err: unknown) {
      console.error('Error fetching migration progress:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch migration progress');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return { data, loading, error, refetch: fetchProgress };
}
