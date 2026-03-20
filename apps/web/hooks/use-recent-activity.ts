import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Activity {
  id: string;
  type: 'order' | 'product' | 'pipeline' | 'system';
  title: string;
  description: string;
  status: 'success' | 'warning' | 'info' | 'pending';
  activity_timestamp: string;
  href: string;
}

export function useRecentActivity(limit = 10) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const { data, error: fetchError } = await supabase
        .rpc('get_dashboard_recent_activity', { limit_count: limit });

      if (fetchError) throw fetchError;

      setActivities(data || []);
    } catch (err: unknown) {
      console.error('Error fetching recent activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch activity');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return { activities, loading, error, refetch: fetchActivity };
}
