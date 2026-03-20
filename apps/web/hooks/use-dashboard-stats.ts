import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ProductStats {
  total_count: number;
  published_count: number;
  out_of_stock_count: number;
  low_stock_count: number;
  last_updated: string;
}

export interface ScraperStats {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  active_jobs: number;
  last_job_created: string;
}

export function useDashboardStats() {
  const [productStats, setProductStats] = useState<ProductStats | null>(null);
  const [scraperStats, setScraperStats] = useState<ScraperStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const [productsRes, scrapersRes] = await Promise.all([
        supabase.from('dashboard_product_stats').select('*').single(),
        supabase.from('dashboard_scraper_stats').select('*').single(),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (scrapersRes.error) throw scrapersRes.error;

      setProductStats(productsRes.data);
      setScraperStats(scrapersRes.data);
    } catch (err: unknown) {
      console.error('Error fetching dashboard stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { productStats, scraperStats, loading, error, refetch: fetchStats };
}
