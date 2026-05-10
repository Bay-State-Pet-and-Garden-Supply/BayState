import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ProductStats {
  total_count: number;
  published_count: number;
  out_of_stock_count: number;
  low_stock_count: number;
  last_updated: string;
}

interface ScraperStats {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  active_jobs: number;
  last_job_created: string;
}

export interface OrderStats {
  today_order_count: number;
  today_sales: number;
  open_orders: number;
  unpaid_orders: number;
  ready_for_pickup: number;
  today_register_orders: number;
  today_web_orders: number;
}

export interface InventoryReconciliationStats {
  open_issues: number;
  register_only_products: number;
  price_mismatches: number;
  quantity_mismatches: number;
  last_issue_created_at: string | null;
}

export function useDashboardStats() {
  const [productStats, setProductStats] = useState<ProductStats | null>(null);
  const [scraperStats, setScraperStats] = useState<ScraperStats | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [inventoryStats, setInventoryStats] = useState<InventoryReconciliationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const [productsRes, scrapersRes, ordersRes, inventoryRes] = await Promise.all([
        supabase.from('dashboard_product_stats').select('*').single(),
        supabase.from('dashboard_scraper_stats').select('*').single(),
        supabase.from('dashboard_order_stats').select('*').single(),
        supabase.from('dashboard_inventory_reconciliation_stats').select('*').single(),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (scrapersRes.error) throw scrapersRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (inventoryRes.error) throw inventoryRes.error;

      setProductStats(productsRes.data);
      setScraperStats(scrapersRes.data);
      setOrderStats(ordersRes.data);
      setInventoryStats(inventoryRes.data);
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

  return { productStats, scraperStats, orderStats, inventoryStats, loading, error, refetch: fetchStats };
}
