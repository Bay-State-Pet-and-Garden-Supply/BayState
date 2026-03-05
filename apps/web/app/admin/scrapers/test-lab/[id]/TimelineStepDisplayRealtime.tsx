'use client';

import { useState, useEffect, useCallback } from 'react';
import { TimelineStepDisplay } from './TimelineStepDisplay';
import { createClient } from '@/lib/supabase/client';

interface StepData {
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

interface TimelineStepDisplayRealtimeProps {
  initialSteps: StepData[];
  testRunId: string;
}

export function TimelineStepDisplayRealtime({
  initialSteps,
  testRunId,
}: TimelineStepDisplayRealtimeProps) {
  const [steps, setSteps] = useState<StepData[]>(initialSteps);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Update steps when initialSteps changes (e.g., from server navigation)
  useEffect(() => {
    setSteps(initialSteps);
  }, [initialSteps]);

  // Handle realtime updates
  const handleRealtimeUpdate = useCallback((payload: { eventType: string; new: StepData; old: StepData }) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    setSteps((currentSteps) => {
      switch (eventType) {
        case 'INSERT':
          // Add new step if it belongs to this test run
          if (newRecord.test_run_id === testRunId) {
            // Avoid duplicates
            if (!currentSteps.find((s) => s.id === newRecord.id)) {
              return [...currentSteps, newRecord].sort((a, b) => a.step_index - b.step_index);
            }
          }
          break;

        case 'UPDATE':
          // Update existing step
          if (newRecord.test_run_id === testRunId) {
            return currentSteps.map((step) =>
              step.id === newRecord.id ? newRecord : step
            ).sort((a, b) => a.step_index - b.step_index);
          }
          break;

        case 'DELETE':
          // Remove deleted step
          if (oldRecord && oldRecord.test_run_id === testRunId) {
            return currentSteps.filter((step) => step.id !== oldRecord.id);
          }
          break;
      }
      return currentSteps;
    });
  }, [testRunId]);

  // Set up Supabase realtime subscription
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;

    const subscribe = async () => {
      try {
        // Create a unique channel name
        const channelName = `test-run-steps-${testRunId}-${Date.now()}`;

        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'scraper_test_run_steps',
              filter: `test_run_id=eq.${testRunId}`,
            },
            (payload) => {
              if (isMounted) {
                handleRealtimeUpdate(payload as unknown as { eventType: string; new: StepData; old: StepData });
              }
            }
          )
          .subscribe((status) => {
            if (!isMounted) return;

            // status is RealtimeSubscribeState
            if (status === 'SUBSCRIBED') {
              setIsConnected(true);
              setConnectionError(null);
            } else if (status === 'CHANNEL_ERROR') {
              setIsConnected(false);
              setConnectionError('Channel error');
            } else {
              setIsConnected(false);
            }
          });
      } catch (error) {
        if (isMounted) {
          setConnectionError(error instanceof Error ? error.message : 'Failed to connect');
          setIsConnected(false);
        }
      }
    };

    subscribe();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [testRunId, handleRealtimeUpdate]);

  return (
    <div>
      {/* Connection status indicator */}
      <div className="mb-4 flex items-center gap-2 text-xs">
        <span
          className={`h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
          }`}
        />
        <span className="text-gray-500">
          {isConnected
            ? 'Live updates active'
            : connectionError || 'Connecting to live updates...'}
        </span>
      </div>

      <TimelineStepDisplay steps={steps} />
    </div>
  );
}
