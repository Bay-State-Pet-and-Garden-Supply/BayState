'use client';

import { useState } from 'react';
import { 
  Clock, CheckCircle2, XCircle, Loader2, Minus, ChevronDown, ChevronUp, 
  AlertCircle, RotateCcw, FileCode, ArrowRight, Play, Terminal
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TestRunStep } from '@/lib/realtime/useTestRunSubscription';

interface StepTraceProps {
  steps: TestRunStep[];
  testRunId: string;
  configId?: string;
  onRetryStep?: (stepId: string) => Promise<void>;
  isRetrying?: boolean;
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
      return <Minus className="h-5 w-5 text-gray-400" />;
    case 'pending':
    default:
      return <Clock className="h-5 w-5 text-gray-300" />;
  }
}

function getStepStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-200">Completed</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'running':
      return <Badge variant="outline" className="border-blue-500 text-blue-500">Running</Badge>;
    case 'skipped':
      return <Badge variant="secondary">Skipped</Badge>;
    case 'pending':
    default:
      return <Badge variant="outline">Pending</Badge>;
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

function formatTimestamp(date: string | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString();
}

export function StepTrace({ steps, testRunId, configId, onRetryStep, isRetrying }: StepTraceProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const toggleExpand = (stepId: string) => {
    setExpandedStep(expandedStep === stepId ? null : stepId);
  };

  const stepSummary = {
    total: steps.length,
    completed: steps.filter(s => s.status === 'completed').length,
    failed: steps.filter(s => s.status === 'failed').length,
    running: steps.filter(s => s.status === 'running').length,
    skipped: steps.filter(s => s.status === 'skipped').length,
    pending: steps.filter(s => s.status === 'pending').length,
  };

  const hasFailedSteps = stepSummary.failed > 0;

  if (steps.length === 0) {
    return (
      <div className="text-center py-12">
        <Terminal className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No step trace data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Step Execution Summary</span>
            <span className="text-xs text-muted-foreground">Run ID: {testRunId.slice(0, 8)}...</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-4 text-center">
            <div className="space-y-1">
              <div className="text-2xl font-bold">{stepSummary.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-green-600">{stepSummary.completed}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-red-600">{stepSummary.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-blue-600">{stepSummary.running}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-gray-500">{stepSummary.skipped}</div>
              <div className="text-xs text-muted-foreground">Skipped</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-gray-400">{stepSummary.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {steps.map((step, index) => {
            const isExpanded = expandedStep === step.id;
            const isFailed = step.status === 'failed';
            
            return (
              <div key={step.id} className="relative flex gap-4">
                <div className="relative z-10 flex-shrink-0">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white ${
                    step.status === 'completed' ? 'border-green-500 bg-green-50' :
                    step.status === 'failed' ? 'border-red-500 bg-red-50' :
                    step.status === 'running' ? 'border-blue-500 bg-blue-50' :
                    'border-gray-300 bg-white'
                  }`}>
                    {getStepStatusIcon(step.status)}
                  </div>
                </div>

                <div className="flex-1 pb-4">
                  <Card className={`${isExpanded ? 'border-blue-300 shadow-md' : ''} ${isFailed ? 'border-red-200' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-500">
                            Step {step.step_index}
                          </span>
                          <span className="text-lg font-semibold">
                            {formatActionType(step.action_type)}
                          </span>
                          {getStepStatusBadge(step.status)}
                        </div>
                        <div className="flex items-center gap-3">
                          {step.duration_ms !== null && (
                            <span className="text-sm text-gray-500">
                              {formatDuration(step.duration_ms)}
                            </span>
                          )}
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
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                              <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="bg-gray-50 rounded-lg p-3">
                              <div className="text-gray-500 mb-1">Started</div>
                              <div className="font-mono">{formatTimestamp(step.started_at)}</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <div className="text-gray-500 mb-1">Completed</div>
                              <div className="font-mono">{formatTimestamp(step.completed_at)}</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <div className="text-gray-500 mb-1">Duration</div>
                              <div className="font-mono">{formatDuration(step.duration_ms)}</div>
                            </div>
                          </div>

                          {isFailed && step.error_message && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-red-700 mb-1">Error Details</p>
                                  <p className="text-sm text-red-600">{step.error_message}</p>
                                  
                                  {onRetryStep && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="mt-3 border-red-300 text-red-600 hover:bg-red-50"
                                      onClick={() => onRetryStep(step.id)}
                                      disabled={isRetrying}
                                    >
                                      {isRetrying ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          Retrying...
                                        </>
                                      ) : (
                                        <>
                                          <RotateCcw className="h-4 w-4 mr-2" />
                                          Retry Step
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Play className="h-4 w-4 text-gray-500" />
                              <p className="text-sm font-medium text-gray-600">Step Context</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-sm">
                              <div className="grid grid-cols-2 gap-2">
                                <div><span className="text-gray-500">Action:</span> {step.action_type}</div>
                                <div><span className="text-gray-500">Index:</span> {step.step_index}</div>
                              </div>
                            </div>
                          </div>

                          {step.extracted_data && Object.keys(step.extracted_data).length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <ArrowRight className="h-4 w-4 text-gray-500" />
                                <p className="text-sm font-medium text-gray-600">Extracted Data</p>
                              </div>
                              <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-48">
                                {JSON.stringify(step.extracted_data, null, 2)}
                              </pre>
                            </div>
                          )}

                          {configId && (
                            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                              <span className="text-sm text-gray-500">View in configuration:</span>
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                              >
                                <a 
                                  href={`/admin/scrapers/studio?tab=configs&config=${configId}&step=${step.step_index}`}
                                  className="flex items-center gap-2"
                                >
                                  <FileCode className="h-4 w-4" />
                                  Open Config at Step {step.step_index}
                                </a>
                              </Button>
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
    </div>
  );
}
