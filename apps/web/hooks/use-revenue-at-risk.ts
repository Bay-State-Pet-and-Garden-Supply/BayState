'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface PriceMismatchItem {
  id: string;
  sku: string;
  register_name: string | null;
  website_price: number | null;
  register_price: number | null;
  register_quantity: number | null;
  revenueRisk: number;
}

export function useRevenueAtRisk() {
  const [items, setItems] = useState<PriceMismatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMismatches() {
      try {
        setLoading(true);
        setError(null);
        const supabase = createClient();

        const { data, error: fetchError } = await supabase
          .from('inventory_reconciliation_items')
          .select('id, sku, register_name, register_price, website_price, register_quantity')
          .eq('issue_type', 'price_mismatch')
          .eq('status', 'open');

        if (fetchError) throw fetchError;

        if (cancelled) return;

        const withRisk: PriceMismatchItem[] = ((data ?? []) as Array<{
          id: string;
          sku: string;
          register_name: string | null;
          register_price: number | null;
          website_price: number | null;
          register_quantity: number | null;
        }>)
          .map((item) => ({
            ...item,
            revenueRisk:
              Math.abs((item.register_price ?? 0) - (item.website_price ?? 0)) *
              (item.register_quantity ?? 0),
          }))
          .sort((a, b) => b.revenueRisk - a.revenueRisk)
          .slice(0, 10);

        setItems(withRisk);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load revenue at risk');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMismatches();

    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}
