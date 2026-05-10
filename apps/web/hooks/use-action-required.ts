'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ActionRequiredItem {
  category: string;
  label: string;
  count: number;
  href: string;
  severity: string;
}

export function useActionRequired() {
  const [items, setItems] = useState<ActionRequiredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: rpcError } = await supabase
        .rpc('get_action_required_items');

      if (rpcError) throw rpcError;
      setItems((data ?? []) as ActionRequiredItem[]);
    } catch (err) {
      console.error('Error fetching action items:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, error, refetch: fetchItems };
}
