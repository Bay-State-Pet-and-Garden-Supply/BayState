'use client';

import { useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type ProductIngestionRow = {
  sku: string;
  sources: Record<string, unknown>;
  pipeline_status: string;
  updated_at: string;
};

interface UseEnrichmentRealtimeOptions {
  sku: string;
  onUpdate: () => void;
  enabled?: boolean;
}

export function useEnrichmentRealtime({ sku, onUpdate, enabled = true }: UseEnrichmentRealtimeOptions) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<ProductIngestionRow>) => {
      if (payload.eventType === 'UPDATE' && payload.new?.sku === sku) {
        onUpdate();
      }
    },
    [sku, onUpdate]
  );

  useEffect(() => {
    if (!enabled || !supabaseUrl || !supabaseAnonKey) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

    const channel = supabase
      .channel(`enrichment:${sku}`)
      .on<ProductIngestionRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'products_ingestion',
          filter: `sku=eq.${sku}`,
        },
        handleChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sku, enabled, supabaseUrl, supabaseAnonKey, handleChange]);
}
