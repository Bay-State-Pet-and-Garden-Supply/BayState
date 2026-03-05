'use client';

import { useState } from 'react';
import { TimelineStepDisplay } from './TimelineStepDisplay';
import { useTestRunSubscription, TestRunStep } from '@/lib/realtime/useTestRunSubscription';

interface TimelineStepDisplayRealtimeProps {
  initialSteps: TestRunStep[];
  testRunId: string;
}

export function TimelineStepDisplayRealtime({
  initialSteps,
  testRunId,
}: TimelineStepDisplayRealtimeProps) {
  const { steps, isConnected, error } = useTestRunSubscription({
    testRunId,
    initialSteps,
  });

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs">
        <span
          className={`h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
          }`}
        />
        <span className="text-gray-500">
          {isConnected
            ? 'Live updates active'
            : error
              ? `Connection error: ${error.message}`
              : 'Connecting to live updates...'}
        </span>
      </div>

      <TimelineStepDisplay steps={steps} />
    </div>
  );
}
