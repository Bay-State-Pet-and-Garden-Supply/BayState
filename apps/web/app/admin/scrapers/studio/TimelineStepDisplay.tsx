'use client';

import { useState } from 'react';
import { Clock, CheckCircle2, XCircle, Loader2, Minus, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TestRunStep } from '@/lib/realtime/useTestRunSubscription';

interface TimelineStepDisplayProps {
  steps: TestRunStep[];
}

function getStepStatusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'skipped':
      return <Minus className="h-5 w-5 text-muted-foreground" />;
    case 'pending':
    default:
      return <Clock className="h-5 w-5 text-gray-300" />;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatActionType(actionType: string): string {
  return actionType
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

export function TimelineStepDisplay({ steps }: TimelineStepDisplayProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const toggleExpand = (stepId: string) => {
    setExpandedStep(expandedStep === stepId ? null : stepId);
  };

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No workflow steps available
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-muted" />

      <div className="space-y-4">
        {steps.map((step, index) => {
          const isExpanded = expandedStep === step.id;
          const isPlaceholder = step.id.startsWith('placeholder-');
          
          return (
            <div key={step.id} className="relative flex gap-4">
              <div className="relative z-10 flex-shrink-0">
                <div className={`flex h-10 w-10 items-center justify-center rounded-none border bg-card ${ step.status === 'completed' ? 'border-green-500 bg-green-50' : step.status === 'failed' ? 'border-red-500 bg-red-50' : step.status === 'running' ? 'border-blue-500 bg-blue-50' : 'border-border bg-card' }`}>
                  {getStepStatusIcon(step.status)}
                </div>
              </div>

              <div className="flex-1 pb-4">
                <Card className="border border-zinc-950 rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground">
                          Step {step.step_index}
                        </span>
                        <span className="text-lg font-semibold">
                          {formatActionType(step.action_type)}
                        </span>
                        {isPlaceholder && (
                          <span className="text-xs text-muted-foreground italic">
                            (expected)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm ${ step.status === 'completed' ? 'text-green-600' : step.status === 'failed' ? 'text-red-600' : step.status === 'running' ? 'text-blue-600' : 'text-muted-foreground' }`}>
                          {step.status}
                        </span>
                        {step.duration_ms !== null && (
                          <span className="text-sm text-muted-foreground">
                            {formatDuration(step.duration_ms)}
                          </span>
                        )}
                        {!isPlaceholder && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpand(step.id)}
                            className="h-8 w-8 p-0"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {isExpanded && !isPlaceholder && (
                      <div className="mt-4 pt-4 border-t border-border space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {step.started_at && (
                            <div>
                              <span className="text-muted-foreground">Started:</span>{' '}
                              <span className="font-mono">
                                {new Date(step.started_at).toLocaleTimeString()}
                              </span>
                            </div>
                          )}
                          {step.completed_at && (
                            <div>
                              <span className="text-muted-foreground">Completed:</span>{' '}
                              <span className="font-mono">
                                {new Date(step.completed_at).toLocaleTimeString()}
                              </span>
                            </div>
                          )}
                        </div>

                        {step.error_message && (
                          <div className="bg-red-50 border border-red-200 rounded-none p-3">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-red-700">Error</p>
                                <p className="text-sm text-red-600 mt-1">
                                  {step.error_message}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {step.extracted_data && Object.keys(step.extracted_data).length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">
                              Extracted Data
                            </p>
                            <pre className="bg-gray-900 text-gray-100 rounded-none p-3 text-xs overflow-x-auto max-h-48">
                              {JSON.stringify(step.extracted_data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
