/**
 * TestComparisonView Component
 *
 * Side-by-side comparison of two test runs with visual diff highlighting.
 * Features: Run A/B selection, difference highlighting, summary metrics,
 * and detailed comparison tabs for selectors, login, and extraction.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  GitCompare,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MinusCircle,
  Activity,
  Target,
  User,
  FileText,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Clock,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Reusable components for displaying test data
import { LiveSelectorResults, SelectorEvent } from './LiveSelectorResults';
import { LiveLoginStatus, LoginEvent } from './LiveLoginStatus';
import { LiveExtractionProgress, ExtractionEvent } from './LiveExtractionProgress';

// Import types from TestRunDetailView
import type { TestRunDetail, TestRunError } from './TestRunDetailView';

// ============================================================================
// Types
// ============================================================================

/** Comparison result for a single item */
export interface ComparisonResult<T> {
  item: T;
  statusA: string;
  statusB: string;
  change: 'improved' | 'regressed' | 'unchanged' | 'new' | 'removed';
  description: string;
}

/** Summary of all differences between two test runs */
export interface ComparisonSummary {
  /** Selectors that were fixed (missing/error → found) */
  selectorsFixed: number;
  /** Selectors that regressed (found → missing/error) */
  selectorsRegressed: number;
  /** Total selector count in run A vs B */
  selectorsCountA: number;
  selectorsCountB: number;
  selectorsFoundA: number;
  selectorsFoundB: number;

  /** Login overall status change */
  loginImproved: boolean;
  loginRegressed: boolean;
  loginStatusA: string;
  loginStatusB: string;

  /** Extraction fields that improved */
  extractionImproved: number;
  /** Extraction fields that regressed */
  extractionRegressed: number;
  extractionSuccessA: number;
  extractionSuccessB: number;

  /** SKU analysis */
  skuOverlap: number;
  skuOnlyInA: number;
  skuOnlyInB: number;
  skuPassedA: number;
  skuPassedB: number;
  skuFailedA: number;
  skuFailedB: number;

  /** Overall health score change */
  healthScoreA: number;
  healthScoreB: number;
  healthScoreChange: number;

  /** Duration change in ms */
  durationChangeMs: number | null;
}

/** Props for TestComparisonView */
export interface TestComparisonViewProps {
  /** All available test runs to choose from */
  availableRuns: TestRunDetail[];
  /** Initially selected run A ID */
  initialRunAId?: string | null;
  /** Initially selected run B ID */
  initialRunBId?: string | null;
  /** Callback when selection changes */
  onSelectionChange?: (runAId: string | null, runBId: string | null) => void;
  /** CSS class for styling */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Format duration from milliseconds */
function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/** Format date for display */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Calculate health score from test results */
function calculateHealthScore(testRun: TestRunDetail): number {
  const total = (testRun.passed_count || 0) + (testRun.failed_count || 0);
  if (total === 0) return 0;
  return Math.round(((testRun.passed_count || 0) / total) * 100);
}

/** Get status badge configuration */
function getStatusBadge(status: string) {
  const normalizedStatus = status.toLowerCase() as TestRunDetail['status'];
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2; label: string; className: string }> = {
    passed: {
      variant: 'default',
      icon: CheckCircle2,
      label: 'Passed',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
    failed: {
      variant: 'destructive',
      icon: XCircle,
      label: 'Failed',
      className: 'bg-red-100 text-red-700 border-red-200',
    },
    partial: {
      variant: 'secondary',
      icon: MinusCircle,
      label: 'Partial',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
    },
    running: {
      variant: 'outline',
      icon: Clock,
      label: 'Running',
      className: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    pending: {
      variant: 'outline',
      icon: Clock,
      label: 'Pending',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
    cancelled: {
      variant: 'secondary',
      icon: AlertCircle,
      label: 'Cancelled',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
  };
  return config[normalizedStatus] || config.pending;
}

/** Get change badge configuration */
function getChangeBadge(change: ComparisonSummary['selectorsFixed'] extends number ? 'improved' | 'regressed' | 'unchanged' | 'new' | 'removed' : never) {
  const configs = {
    improved: {
      variant: 'default' as const,
      icon: TrendingUp,
      label: 'Improved',
      className: 'bg-green-100 text-green-700 border-green-200',
    },
    regressed: {
      variant: 'destructive' as const,
      icon: TrendingDown,
      label: 'Regressed',
      className: 'bg-red-100 text-red-700 border-red-200',
    },
    unchanged: {
      variant: 'outline' as const,
      icon: Minus,
      label: 'Unchanged',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
    new: {
      variant: 'default' as const,
      icon: Plus,
      label: 'New',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
    },
    removed: {
      variant: 'secondary' as const,
      icon: XCircle,
      label: 'Removed',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
  };
  return configs[change];
}

// ============================================================================
// Comparison Logic
// ============================================================================

/** Compare two test runs and calculate differences */
function compareTestRuns(runA: TestRunDetail, runB: TestRunDetail): ComparisonSummary {
  // Selector comparison
  const selectorsA = runA.selector_events || [];
  const selectorsB = runB.selector_events || [];

  const selectorMapA = new Map(selectorsA.map((s) => [s.selector_name, s.status]));
  const selectorMapB = new Map(selectorsB.map((s) => [s.selector_name, s.status]));

  let selectorsFixed = 0;
  let selectorsRegressed = 0;

  // Check all selectors from both runs
  const allSelectors = new Set([...selectorMapA.keys(), ...selectorMapB.keys()]);
  allSelectors.forEach((name) => {
    const statusA = selectorMapA.get(name);
    const statusB = selectorMapB.get(name);

    if (statusA && !statusB) {
      // Selector was in A but not in B - could be a removal
      return;
    }

    if (!statusA && statusB) {
      // New selector in B
      return;
    }

    if (statusA && statusB && statusA !== statusB) {
      // Status changed
      const aGood = statusA === 'FOUND';
      const bGood = statusB === 'FOUND';

      if (!aGood && bGood) {
        selectorsFixed++;
      } else if (aGood && !bGood) {
        selectorsRegressed++;
      }
    }
  });

  const selectorsFoundA = selectorsA.filter((s) => s.status === 'FOUND').length;
  const selectorsFoundB = selectorsB.filter((s) => s.status === 'FOUND').length;

  // Login comparison
  const loginStatusA = runA.login_event?.overall_status || 'SKIPPED';
  const loginStatusB = runB.login_event?.overall_status || 'SKIPPED';

  const loginImproved = loginStatusA !== 'SUCCESS' && loginStatusB === 'SUCCESS';
  const loginRegressed = loginStatusA === 'SUCCESS' && loginStatusB !== 'SUCCESS';

  // Extraction comparison
  const extractionA = runA.extraction_events || [];
  const extractionB = runB.extraction_events || [];

  const extractionMapA = new Map(extractionA.map((e) => [e.field_name, e.status]));
  const extractionMapB = new Map(extractionB.map((e) => [e.field_name, e.status]));

  let extractionImproved = 0;
  let extractionRegressed = 0;

  const allFields = new Set([...extractionMapA.keys(), ...extractionMapB.keys()]);
  allFields.forEach((name) => {
    const statusA = extractionMapA.get(name);
    const statusB = extractionMapB.get(name);

    if (statusA && statusB && statusA !== statusB) {
      const aGood = statusA === 'SUCCESS';
      const bGood = statusB === 'SUCCESS';

      if (!aGood && bGood) {
        extractionImproved++;
      } else if (aGood && !bGood) {
        extractionRegressed++;
      }
    }
  });

  const extractionSuccessA = extractionA.filter((e) => e.status === 'SUCCESS').length;
  const extractionSuccessB = extractionB.filter((e) => e.status === 'SUCCESS').length;

  // SKU comparison
  const skusA = new Set(runA.skus_tested || []);
  const skusB = new Set(runB.skus_tested || []);

  const skuOverlap = [...skusA].filter((s) => skusB.has(s)).length;
  const skuOnlyInA = [...skusA].filter((s) => !skusB.has(s)).length;
  const skuOnlyInB = [...skusB].filter((s) => !skusA.has(s)).length;

  // Health score
  const healthScoreA = calculateHealthScore(runA);
  const healthScoreB = calculateHealthScore(runB);
  const healthScoreChange = healthScoreB - healthScoreA;

  // Duration
  const durationChangeMs = runA.duration_ms && runB.duration_ms
    ? runB.duration_ms - runA.duration_ms
    : null;

  return {
    selectorsFixed,
    selectorsRegressed,
    selectorsCountA: selectorsA.length,
    selectorsCountB: selectorsB.length,
    selectorsFoundA,
    selectorsFoundB,
    loginImproved,
    loginRegressed,
    loginStatusA,
    loginStatusB,
    extractionImproved,
    extractionRegressed,
    extractionSuccessA,
    extractionSuccessB,
    skuOverlap,
    skuOnlyInA,
    skuOnlyInB,
    skuPassedA: runA.passed_count || 0,
    skuPassedB: runB.passed_count || 0,
    skuFailedA: runA.failed_count || 0,
    skuFailedB: runB.failed_count || 0,
    healthScoreA,
    healthScoreB,
    healthScoreChange,
    durationChangeMs,
  };
}

/** Get selectors with changes between two runs */
function getChangedSelectors(runA: TestRunDetail, runB: TestRunDetail): ComparisonResult<SelectorEvent>[] {
  const selectorsA = runA.selector_events || [];
  const selectorsB = runB.selector_events || [];

  const selectorMapA = new Map(selectorsA.map((s) => [s.selector_name, s]));
  const selectorMapB = new Map(selectorsB.map((s) => [s.selector_name, s]));

  const allSelectors = new Set([...selectorMapA.keys(), ...selectorMapB.keys()]);
  const changes: ComparisonResult<SelectorEvent>[] = [];

  allSelectors.forEach((name) => {
    const itemA = selectorMapA.get(name);
    const itemB = selectorMapB.get(name);

    if (itemA && !itemB) {
      // Removed
      changes.push({
        item: itemA,
        statusA: itemA.status,
        statusB: 'REMOVED',
        change: 'removed',
        description: `Selector "${name}" was removed`,
      });
    } else if (!itemA && itemB) {
      // New
      changes.push({
        item: itemB,
        statusA: 'NEW',
        statusB: itemB.status,
        change: 'new',
        description: `Selector "${name}" was added`,
      });
    } else if (itemA && itemB && itemA.status !== itemB.status) {
      // Changed
      const improved = itemA.status !== 'FOUND' && itemB.status === 'FOUND';
      const regressed = itemA.status === 'FOUND' && itemB.status !== 'FOUND';

      changes.push({
        item: itemB,
        statusA: itemA.status,
        statusB: itemB.status,
        change: improved ? 'improved' : regressed ? 'regressed' : 'unchanged',
        description: improved
          ? `Selector "${name}" fixed: ${itemA.status} → ${itemB.status}`
          : `Selector "${name}" regressed: ${itemA.status} → ${itemB.status}`,
      });
    }
  });

  return changes;
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Summary metrics card showing overall comparison */
function ComparisonSummaryCard({ summary }: { summary: ComparisonSummary }) {
  const hasChanges = summary.selectorsFixed > 0 || summary.selectorsRegressed > 0 ||
    summary.loginImproved || summary.loginRegressed ||
    summary.extractionImproved > 0 || summary.extractionRegressed > 0 ||
    summary.healthScoreChange !== 0;

  if (!hasChanges) {
    return (
      <Card className="bg-gray-50 border-dashed">
        <CardContent className="py-8 text-center">
          <GitCompare className="h-8 w-8 mx-auto text-gray-400 mb-3" />
          <p className="text-sm text-muted-foreground">No significant changes between runs</p>
          <p className="text-xs text-muted-foreground mt-1">
            Runs have similar results across all metrics
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Comparison Summary
        </CardTitle>
        <CardDescription>Key differences between the two test runs</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Health Score Change */}
        <div className={cn(
          'flex items-center justify-between p-3 rounded-lg mb-3',
          summary.healthScoreChange > 0 ? 'bg-green-50 border border-green-200' :
          summary.healthScoreChange < 0 ? 'bg-red-50 border border-red-200' :
          'bg-gray-50 border border-gray-200'
        )}>
          <div className="flex items-center gap-2">
            {summary.healthScoreChange > 0 ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : summary.healthScoreChange < 0 ? (
              <TrendingDown className="h-5 w-5 text-red-600" />
            ) : (
              <Minus className="h-5 w-5 text-gray-500" />
            )}
            <span className="font-medium">Health Score</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{summary.healthScoreA}%</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold">{summary.healthScoreB}%</span>
            {summary.healthScoreChange !== 0 && (
              <Badge variant={summary.healthScoreChange > 0 ? 'default' : 'destructive'}>
                {summary.healthScoreChange > 0 ? '+' : ''}{summary.healthScoreChange}%
              </Badge>
            )}
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Selectors Fixed */}
          <div className={cn(
            'p-3 rounded-lg border',
            summary.selectorsFixed > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className={cn(
                'h-4 w-4',
                summary.selectorsFixed > 0 ? 'text-green-600' : 'text-gray-400'
              )} />
              <span className="text-xs text-muted-foreground">Selectors Fixed</span>
            </div>
            <p className={cn(
              'text-2xl font-bold',
              summary.selectorsFixed > 0 ? 'text-green-700' : 'text-gray-600'
            )}>
              {summary.selectorsFixed}
            </p>
          </div>

          {/* Selectors Regressed */}
          <div className={cn(
            'p-3 rounded-lg border',
            summary.selectorsRegressed > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <XCircle className={cn(
                'h-4 w-4',
                summary.selectorsRegressed > 0 ? 'text-red-600' : 'text-gray-400'
              )} />
              <span className="text-xs text-muted-foreground">New Failures</span>
            </div>
            <p className={cn(
              'text-2xl font-bold',
              summary.selectorsRegressed > 0 ? 'text-red-700' : 'text-gray-600'
            )}>
              {summary.selectorsRegressed}
            </p>
          </div>

          {/* Login Status */}
          <div className={cn(
            'p-3 rounded-lg border',
            summary.loginImproved ? 'bg-green-50 border-green-200' :
            summary.loginRegressed ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <User className={cn(
                'h-4 w-4',
                summary.loginImproved ? 'text-green-600' :
                summary.loginRegressed ? 'text-red-600' : 'text-gray-400'
              )} />
              <span className="text-xs text-muted-foreground">Login</span>
            </div>
            <p className={cn(
              'text-sm font-medium',
              summary.loginImproved ? 'text-green-700' :
              summary.loginRegressed ? 'text-red-700' : 'text-gray-600'
            )}>
              {summary.loginImproved ? 'Improved' :
               summary.loginRegressed ? 'Regressed' : 'Unchanged'}
            </p>
          </div>

          {/* Extraction Changes */}
          <div className={cn(
            'p-3 rounded-lg border',
            summary.extractionImproved > 0 || summary.extractionRegressed > 0
              ? (summary.extractionImproved > summary.extractionRegressed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')
              : 'bg-gray-50 border-gray-200'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <FileText className={cn(
                'h-4 w-4',
                summary.extractionImproved > 0 ? 'text-green-600' :
                summary.extractionRegressed > 0 ? 'text-red-600' : 'text-gray-400'
              )} />
              <span className="text-xs text-muted-foreground">Extraction</span>
            </div>
            <p className={cn(
              'text-sm font-medium',
              summary.extractionImproved > 0 ? 'text-green-700' :
              summary.extractionRegressed > 0 ? 'text-red-700' : 'text-gray-600'
            )}>
              {summary.extractionImproved > 0 ? `+${summary.extractionImproved} improved` :
               summary.extractionRegressed > 0 ? `${summary.extractionRegressed} regressed` : 'No change'}
            </p>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="mt-4 pt-4 border-t space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Duration Change</span>
            <span className={cn(
              'font-mono',
              summary.durationChangeMs && summary.durationChangeMs > 0 ? 'text-red-600' :
              summary.durationChangeMs && summary.durationChangeMs < 0 ? 'text-green-600' : 'text-gray-600'
            )}>
              {summary.durationChangeMs !== null
                ? (summary.durationChangeMs > 0 ? '+' : '') + formatDuration(summary.durationChangeMs)
                : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">SKU Overlap</span>
            <span className="font-mono">{summary.skuOverlap} SKUs in common</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Results</span>
            <div className="flex items-center gap-3">
              <span className="text-green-600">
                {summary.skuPassedB > summary.skuPassedA ? '+' : ''}{summary.skuPassedB - summary.skuPassedA} passed
              </span>
              <span className="text-red-600">
                {summary.skuFailedB > summary.skuFailedA ? '+' : ''}{summary.skuFailedB - summary.skuFailedA} failed
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Selector comparison table showing changes */
function SelectorComparisonTable({ runA, runB }: { runA: TestRunDetail; runB: TestRunDetail }) {
  const changes = useMemo(() => getChangedSelectors(runA, runB), [runA, runB]);

  const improved = changes.filter((c) => c.change === 'improved');
  const regressed = changes.filter((c) => c.change === 'regressed');
  const unchanged = changes.filter((c) => c.change === 'unchanged');
  const newItems = changes.filter((c) => c.change === 'new');
  const removed = changes.filter((c) => c.change === 'removed');

  if (changes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-3" />
          <p className="text-sm font-medium">All selectors unchanged</p>
          <p className="text-xs text-muted-foreground mt-1">
            No selector status differences between runs
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Improved Selectors */}
      {improved.length > 0 && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Fixed Selectors ({improved.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {improved.map((change) => (
                <div key={change.item.selector_name} className="flex items-center justify-between p-2 bg-white rounded border border-green-100">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{change.item.selector_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-red-50 border-red-200 text-red-700">
                      {change.statusA}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
                      {change.statusB}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regressed Selectors */}
      {regressed.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <XCircle className="h-4 w-4" />
              New Failures ({regressed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {regressed.map((change) => (
                <div key={change.item.selector_name} className="flex items-center justify-between p-2 bg-white rounded border border-red-100">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{change.item.selector_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
                      {change.statusA}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="bg-red-50 border-red-200 text-red-700">
                      {change.statusB}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Selectors */}
      {newItems.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-blue-700">
              <Plus className="h-4 w-4" />
              New Selectors ({newItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {newItems.map((change) => (
                <Badge key={change.item.selector_name} variant="outline" className="bg-blue-50 border-blue-200">
                  {change.item.selector_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Removed Selectors */}
      {removed.length > 0 && (
        <Card className="border-gray-200 bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-gray-700">
              <XCircle className="h-4 w-4" />
              Removed Selectors ({removed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {removed.map((change) => (
                <Badge key={change.item.selector_name} variant="outline" className="bg-gray-100 border-gray-200">
                  {change.item.selector_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unchanged Count */}
      {unchanged.length > 0 && (
        <div className="text-sm text-muted-foreground text-center">
          <MinusCircle className="h-4 w-4 inline mr-1" />
          {unchanged.length} selectors unchanged
        </div>
      )}
    </div>
  );
}

/** Login status side-by-side comparison */
function LoginComparison({ runA, runB, summary }: { runA: TestRunDetail; runB: TestRunDetail; summary: ComparisonSummary }) {
  const loginA = runA.login_event;
  const loginB = runB.login_event;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'FAILED':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'ERROR':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Run A Login */}
      <Card className={cn(
        'border-2',
        summary.loginRegressed ? 'border-red-300' : 'border-transparent'
      )}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Run A - Login</CardTitle>
        </CardHeader>
        <CardContent>
          {loginA ? (
            <div className="space-y-3">
              <div className={cn(
                'px-3 py-2 rounded-lg border text-center font-medium',
                getStatusColor(loginA.overall_status)
              )}>
                {loginA.overall_status}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Username</span>
                  <Badge variant="outline">{loginA.username_field_status || '-'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Password</span>
                  <Badge variant="outline">{loginA.password_field_status || '-'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submit</span>
                  <Badge variant="outline">{loginA.submit_button_status || '-'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Success</span>
                  <Badge variant="outline">{loginA.success_indicator_status || '-'}</Badge>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No login data</p>
          )}
        </CardContent>
      </Card>

      {/* Run B Login */}
      <Card className={cn(
        'border-2',
        summary.loginImproved ? 'border-green-300' : summary.loginRegressed ? 'border-red-300' : 'border-transparent'
      )}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Run B - Login</CardTitle>
        </CardHeader>
        <CardContent>
          {loginB ? (
            <div className="space-y-3">
              <div className={cn(
                'px-3 py-2 rounded-lg border text-center font-medium',
                getStatusColor(loginB.overall_status)
              )}>
                {loginB.overall_status}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Username</span>
                  <Badge variant="outline">{loginB.username_field_status || '-'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Password</span>
                  <Badge variant="outline">{loginB.password_field_status || '-'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submit</span>
                  <Badge variant="outline">{loginB.submit_button_status || '-'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Success</span>
                  <Badge variant="outline">{loginB.success_indicator_status || '-'}</Badge>
                </div>
              </div>
              {loginA && loginA.overall_status !== loginB.overall_status && (
                <div className={cn(
                  'flex items-center justify-center gap-2 p-2 rounded text-sm font-medium',
                  summary.loginImproved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                )}>
                  {summary.loginImproved ? (
                    <><TrendingUp className="h-4 w-4" /> Improved</>
                  ) : (
                    <><TrendingDown className="h-4 w-4" /> Regressed</>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No login data</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Extraction comparison */
function ExtractionComparison({ runA, runB, summary }: { runA: TestRunDetail; runB: TestRunDetail; summary: ComparisonSummary }) {
  const extractionA = runA.extraction_events || [];
  const extractionB = runB.extraction_events || [];

  // Filter out events without field_name and create maps
  const fieldMapA = new Map(extractionA.filter(e => e.field_name).map((e) => [e.field_name!, e.status]));
  const fieldMapB = new Map(extractionB.filter(e => e.field_name).map((e) => [e.field_name!, e.status]));

  const allFields = new Set([...fieldMapA.keys(), ...fieldMapB.keys()]);
  const improved: string[] = [];
  const regressed: string[] = [];

  allFields.forEach((name) => {
    const statusA = fieldMapA.get(name);
    const statusB = fieldMapB.get(name);

    if (statusA && statusB && statusA !== statusB) {
      const aGood = statusA === 'SUCCESS';
      const bGood = statusB === 'SUCCESS';

      if (!aGood && bGood) {
        improved.push(name);
      } else if (aGood && !bGood) {
        regressed.push(name);
      }
    }
  });

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{summary.extractionSuccessB}</p>
            <p className="text-xs text-muted-foreground">Success (Run B)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-red-600">{regressed.length}</p>
            <p className="text-xs text-muted-foreground">Regressed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{improved.length}</p>
            <p className="text-xs text-muted-foreground">Improved</p>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      {(improved.length > 0 || regressed.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {improved.length > 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-green-700">Fixed Fields ({improved.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {improved.map((name) => (
                    <Badge key={name} variant="outline" className="bg-white border-green-200">
                      {name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {regressed.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-700">Failed Fields ({regressed.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {regressed.map((name) => (
                    <Badge key={name} variant="outline" className="bg-white border-red-200">
                      {name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {improved.length === 0 && regressed.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-3" />
            <p className="text-sm font-medium">All extraction fields unchanged</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Plus icon component for the template */
function Plus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TestComparisonView({
  availableRuns,
  initialRunAId,
  initialRunBId,
  onSelectionChange,
  className,
}: TestComparisonViewProps) {
  const [runAId, setRunAId] = useState<string | null>(initialRunAId || null);
  const [runBId, setRunBId] = useState<string | null>(initialRunBId || null);

  // Get selected runs
  const runA = useMemo(() =>
    availableRuns.find((r) => r.id === runAId) || null,
    [availableRuns, runAId]
  );

  const runB = useMemo(() =>
    availableRuns.find((r) => r.id === runBId) || null,
    [availableRuns, runBId]
  );

  // Calculate comparison when both runs are selected
  const comparison = useMemo(() => {
    if (!runA || !runB) return null;
    return compareTestRuns(runA, runB);
  }, [runA, runB]);

  // Handle selection change
  const handleRunASelect = useCallback((id: string) => {
    const newId = id === 'none' ? null : id;
    setRunAId(newId);
    onSelectionChange?.(newId, runBId);
  }, [runBId, onSelectionChange]);

  const handleRunBSelect = useCallback((id: string) => {
    const newId = id === 'none' ? null : id;
    setRunBId(newId);
    onSelectionChange?.(runAId, newId);
  }, [runAId, onSelectionChange]);

  // Get status badge for a run
  const getRunStatusBadge = (run: TestRunDetail | null) => {
    if (!run) return null;
    return getStatusBadge(run.status);
  };

  // Early return if no runs available
  if (availableRuns.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-12 text-center">
          <GitCompare className="h-8 w-8 mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-900">No test runs available</p>
          <p className="text-xs text-muted-foreground mt-1">
            Run some tests to compare results
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Run Selection Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Compare Test Runs
          </CardTitle>
          <CardDescription>
            Select two runs to compare side-by-side
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* Run A Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Baseline (Run A)</label>
              <Select value={runAId || 'none'} onValueChange={handleRunASelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select baseline run" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableRuns.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      <div className="flex items-center gap-2">
                        {run.scraper_name || run.scraper_id}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(run.created_at)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {runA && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className={getRunStatusBadge(runA)?.className}>
                    {getRunStatusBadge(runA)?.label}
                  </Badge>
                  <span className="text-muted-foreground">
                    {runA.passed_count}/{runA.skus_tested?.length || 0} passed
                  </span>
                </div>
              )}
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="h-px w-16 bg-gray-300" />
              <GitCompare className="h-5 w-5 text-gray-400 mx-2" />
              <div className="h-px w-16 bg-gray-300" />
            </div>

            {/* Run B Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Comparison (Run B)</label>
              <Select value={runBId || 'none'} onValueChange={handleRunBSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select comparison run" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableRuns.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      <div className="flex items-center gap-2">
                        {run.scraper_name || run.scraper_id}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(run.created_at)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {runB && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className={getRunStatusBadge(runB)?.className}>
                    {getRunStatusBadge(runB)?.label}
                  </Badge>
                  <span className="text-muted-foreground">
                    {runB.passed_count}/{runB.skus_tested?.length || 0} passed
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Validation */}
          {runA && runB && runA.id === runB.id && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700">
                Please select two different runs to compare
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Content */}
      {runA && runB && runA.id !== runB.id && comparison && (
        <>
          {/* Summary Card */}
          <ComparisonSummaryCard summary={comparison} />

          {/* Detailed Comparison Tabs */}
          <Tabs defaultValue="selectors" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="selectors" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Selectors
              </TabsTrigger>
              <TabsTrigger value="login" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Login
              </TabsTrigger>
              <TabsTrigger value="extraction" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Extraction
              </TabsTrigger>
              <TabsTrigger value="results" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Results
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[500px] mt-4">
              <TabsContent value="selectors" className="mt-0">
                <SelectorComparisonTable runA={runA} runB={runB} />
              </TabsContent>

              <TabsContent value="login" className="mt-0">
                <LoginComparison runA={runA} runB={runB} summary={comparison} />
              </TabsContent>

              <TabsContent value="extraction" className="mt-0">
                <ExtractionComparison runA={runA} runB={runB} summary={comparison} />
              </TabsContent>

              <TabsContent value="results" className="mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Run A Results */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Run A Results</CardTitle>
                      <CardDescription>{formatDate(runA.created_at)}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Health Score</span>
                        <span className="font-bold">{comparison.healthScoreA}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration</span>
                        <span>{formatDuration(runA.duration_ms)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Passed</span>
                        <span className="text-green-600">{runA.passed_count || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Failed</span>
                        <span className="text-red-600">{runA.failed_count || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SKUs</span>
                        <span>{runA.skus_tested?.length || 0}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Run B Results */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Run B Results</CardTitle>
                      <CardDescription>{formatDate(runB.created_at)}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Health Score</span>
                        <span className={cn(
                          'font-bold',
                          comparison.healthScoreChange > 0 ? 'text-green-600' :
                          comparison.healthScoreChange < 0 ? 'text-red-600' : ''
                        )}>
                          {comparison.healthScoreB}%
                          {comparison.healthScoreChange !== 0 && (
                            <span className="ml-2 text-sm">
                              ({comparison.healthScoreChange > 0 ? '+' : ''}{comparison.healthScoreChange}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration</span>
                        <span>{formatDuration(runB.duration_ms)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Passed</span>
                        <span className="text-green-600">{runB.passed_count || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Failed</span>
                        <span className="text-red-600">{runB.failed_count || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SKUs</span>
                        <span>{runB.skus_tested?.length || 0}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </>
      )}

      {/* Empty State */}
      {(!runA || !runB) && (
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="py-12 text-center">
            <GitCompare className="h-8 w-8 mx-auto text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-900">
              {runA && !runB ? 'Select Run B to compare' :
               !runA && runB ? 'Select Run A to compare' :
               'Select two runs to compare'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Choose runs from the dropdowns above
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TestComparisonView;
