/**
 * useTestRunSubscription - Supabase Postgres Changes hook for subscribing to scraper_test_run_steps table
 *
 * This hook subscribes to INSERT, UPDATE, and DELETE events on the scraper_test_run_steps table.
 * Used for real-time tracking of test run steps execution.
 */

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface TestRunStep {
  id: string;
  test_run_id: string;
  step_index: number;
  action_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
}

export interface TestRunSubscriptionState {
  steps: TestRunStep[];
  isConnected: boolean;
  error: Error | null;
}

export interface UseTestRunSubscriptionOptions {
  /** The test run ID to subscribe to */
  testRunId: string;
  /** Initial steps data */
  initialSteps?: TestRunStep[];
  /** Whether to automatically connect on mount (default: true) */
  autoConnect?: boolean;
}

const DEFAULT_OPTIONS: Partial<UseTestRunSubscriptionOptions> = {
  autoConnect: true,
  initialSteps: [],
};

export function useTestRunSubscription(
  options: UseTestRunSubscriptionOptions
): TestRunSubscriptionState & {
  connect: () => void;
  disconnect: () => void;
} {
  const {
    testRunId,
    initialSteps = [],
    autoConnect = true,
  } = { ...DEFAULT_OPTIONS, ...options };

  const [state, setState] = useState<TestRunSubscriptionState>({
    steps: initialSteps,
    isConnected: false,
    error: null,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    setState(prev => ({
      ...prev,
      steps: initialSteps
    }));
  }, [initialSteps]);

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

  const handleRealtimeUpdate = useCallback((payload: RealtimePostgresChangesPayload<TestRunStep>) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const newStep = newRecord as TestRunStep;
    const oldStep = oldRecord as TestRunStep;

    setState((prev) => {
      let currentSteps = [...prev.steps];

      switch (eventType) {
        case 'INSERT':
          if (newStep.test_run_id === testRunId) {
            if (!currentSteps.find((s) => s.id === newStep.id)) {
              currentSteps.push(newStep);
            }
          }
          break;

        case 'UPDATE':
          if (newStep.test_run_id === testRunId) {
            currentSteps = currentSteps.map((step) =>
              step.id === newStep.id ? newStep : step
            );
          }
          break;

        case 'DELETE':
          if (oldStep && oldStep.test_run_id === testRunId) {
            currentSteps = currentSteps.filter((step) => step.id !== oldStep.id);
          }
          break;
      }

      return {
        ...prev,
        steps: currentSteps.sort((a, b) => a.step_index - b.step_index),
      };
    });
  }, [testRunId]);

  const connect = useCallback(() => {
    if (!testRunId) return;

    const supabase = getSupabase();

    try {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channelName = `test-run-steps-${testRunId}-${Date.now()}`;
      const channel = supabase.channel(channelName);

      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scraper_test_run_steps',
            filter: `test_run_id=eq.${testRunId}`,
          },
          (payload) => {
            handleRealtimeUpdate(payload as RealtimePostgresChangesPayload<TestRunStep>);
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            setState((prev) => ({ ...prev, isConnected: true, error: null }));
          } else if (status === 'CHANNEL_ERROR') {
            const error = new Error(`Subscription channel error: ${err?.message || 'unknown'}`);
            setState((prev) => ({ ...prev, error, isConnected: false }));
          } else {
            setState((prev) => ({ ...prev, isConnected: false }));
          }
        });

      channelRef.current = channel;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      setState((prev) => ({ ...prev, error, isConnected: false }));
    }
  }, [testRunId, getSupabase, handleRealtimeUpdate]);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      const supabase = getSupabase();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setState((prev) => ({ ...prev, isConnected: false }));
  }, [getSupabase]);

  useEffect(() => {
    if (autoConnect && testRunId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, testRunId, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
