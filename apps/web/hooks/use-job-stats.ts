import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScrapeJob } from '@/types/scraper';

export interface JobStats {
  totalJobs: number;
  successRate: number;
  itemsPerMin: number;
  activeJobs: number;
}

export function useJobStats() {
  const [stats, setStats] = useState<JobStats>({
    totalJobs: 0,
    successRate: 0,
    itemsPerMin: 0,
    activeJobs: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const { data, error: fetchError } = await supabase
        .from('scrape_jobs')
        .select('status, created_at, completed_at, skus')
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        setStats({
          totalJobs: 0,
          successRate: 0,
          itemsPerMin: 0,
          activeJobs: 0,
        });
        return;
      }

      // Calculate stats
      const totalJobs = data.length;
      const activeJobs = data.filter((job) => job.status === 'running').length;
      
      const completedJobs = data.filter((job) => job.status === 'completed');
      const successRate = totalJobs > 0 
        ? (completedJobs.length / totalJobs) * 100 
        : 0;

      // Calculate items per minute based on completed jobs
      let totalItems = 0;
      let totalDurationMs = 0;

      completedJobs.forEach((job) => {
        if (job.created_at && job.completed_at && job.skus) {
          const start = new Date(job.created_at).getTime();
          const end = new Date(job.completed_at).getTime();
          const duration = end - start;
          
          if (duration > 0) {
            totalItems += Array.isArray(job.skus) ? job.skus.length : 0;
            totalDurationMs += duration;
          }
        }
      });

      const totalDurationMinutes = totalDurationMs / 60000;
      const itemsPerMin = totalDurationMinutes > 0 
        ? totalItems / totalDurationMinutes 
        : 0;

      setStats({
        totalJobs,
        successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
        itemsPerMin: Math.round(itemsPerMin * 10) / 10, // Round to 1 decimal
        activeJobs,
      });
    } catch (err: any) {
      console.error('Error fetching job stats:', err);
      setError(err.message || 'Failed to fetch job stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
