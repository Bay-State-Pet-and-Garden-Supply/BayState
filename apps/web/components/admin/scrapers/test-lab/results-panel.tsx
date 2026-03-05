'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ImageLightbox } from '@/components/admin/scrapers/test-lab/image-lightbox';

type SelectorStatus = 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED';
type ExtractionStatus = 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FOUND';
type SkuStatus = 'pending' | 'running' | 'success' | 'no_results' | 'error' | 'failed';

interface SelectorTelemetry {
  selector_name: string;
  selector_value: string;
  status: SelectorStatus;
  duration_ms?: number;
  error_message?: string;
}

interface ExtractionTelemetry {
  field_name: string;
  field_value?: string;
  status: ExtractionStatus;
  duration_ms?: number;
  error_message?: string;
}

export interface SkuResult {
  sku: string;
  sku_type?: 'golden' | 'fake' | 'edge' | 'test' | 'edge_case';
  status: SkuStatus;
  duration_ms?: number;
  data?: Record<string, unknown>;
  error?: string;
  images?: string[];
  telemetry?: {
    selectors?: SelectorTelemetry[];
    extractions?: ExtractionTelemetry[];
  };
}

interface ResultsPanelProps {
  results: SkuResult[];
  isLoading?: boolean;
  isStreaming?: boolean;
}

function isExpectedSuccess(result: SkuResult): boolean {
  return result.status === 'success' || (result.sku_type === 'fake' && result.status === 'no_results');
}

function getSkuStatusPill(result: SkuResult): { label: string; tone: 'default' | 'destructive' | 'secondary' | 'outline' } {
  if (result.sku_type === 'fake' && result.status === 'no_results') {
    return { label: 'Expected Success', tone: 'default' };
  }

  if (result.status === 'success') {
    return { label: 'Success', tone: 'default' };
  }

  if (result.status === 'running') {
    return { label: 'Running', tone: 'secondary' };
  }

  if (result.status === 'pending') {
    return { label: 'Pending', tone: 'outline' };
  }

  if (result.status === 'no_results') {
    return { label: 'No Results', tone: 'secondary' };
  }

  return { label: 'Failed', tone: 'destructive' };
}

function getStatusIcon(result: SkuResult) {
  if (result.status === 'running') {
    return <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-hidden="true" />;
  }

  if (result.status === 'pending') {
    return <Clock3 className="h-4 w-4 text-gray-500" aria-hidden="true" />;
  }

  if (isExpectedSuccess(result)) {
    return <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />;
  }

  if (result.status === 'no_results') {
    return <AlertCircle className="h-4 w-4 text-yellow-500" aria-hidden="true" />;
  }

  return <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />;
}

function getSelectorHealth(selectors: SelectorTelemetry[]): number {
  if (selectors.length === 0) {
    return 0;
  }
  const found = selectors.filter((item) => item.status === 'FOUND').length;
  return Math.round((found / selectors.length) * 100);
}

function formatDuration(duration?: number): string {
  if (!duration && duration !== 0) {
    return '-';
  }
  return `${duration}ms`;
}

export function ResultsPanel({ results, isLoading = false, isStreaming = false }: ResultsPanelProps) {
  const total = results.length;
  const noResults = results.filter((item) => item.status === 'no_results').length;
  const passed = results.filter((item) => isExpectedSuccess(item)).length;
  const failed = results.filter(
    (item) => !isExpectedSuccess(item) && item.status !== 'running' && item.status !== 'pending' && item.status !== 'no_results'
  ).length;

  const allSelectors = results.flatMap((item) => item.telemetry?.selectors ?? []);
  const overallHealth = getSelectorHealth(allSelectors);

  if (isLoading) {
    return (
      <div data-testid="results-panel" className="space-y-4">
        <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <Card data-testid="results-panel">
        <CardContent className="py-10 text-center text-muted-foreground">
          {isStreaming ? 'Waiting for first SKU results...' : 'No results yet. Run a test to populate this panel.'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div data-testid="results-panel" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Results Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total SKUs</div>
              <div className="text-xl font-semibold">{total}</div>
            </div>
            <div className="rounded-md border border-green-100 bg-green-50 p-3">
              <div className="text-xs uppercase tracking-wide text-green-700">Passed</div>
              <div className="text-xl font-semibold text-green-800">{passed}</div>
            </div>
            <div className="rounded-md border border-red-100 bg-red-50 p-3">
              <div className="text-xs uppercase tracking-wide text-red-700">Failed</div>
              <div className="text-xl font-semibold text-red-800">{failed}</div>
            </div>
            <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
              <div className="text-xs uppercase tracking-wide text-amber-700">No Results</div>
              <div className="text-xl font-semibold text-amber-800">{noResults}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Overall Health</div>
              <div className="text-xl font-semibold">{overallHealth}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {results.map((result) => {
        const selectors = result.telemetry?.selectors ?? [];
        const extractions = result.telemetry?.extractions ?? [];
        const selectorHealth = getSelectorHealth(selectors);
        const selectorCounts: Record<SelectorStatus, number> = {
          FOUND: selectors.filter((item) => item.status === 'FOUND').length,
          MISSING: selectors.filter((item) => item.status === 'MISSING').length,
          ERROR: selectors.filter((item) => item.status === 'ERROR').length,
          SKIPPED: selectors.filter((item) => item.status === 'SKIPPED').length,
        };
        const statusPill = getSkuStatusPill(result);

        return (
          <Card key={result.sku} data-testid={`sku-card-${result.sku}`}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {getStatusIcon(result)}
                  <span className="font-mono text-sm font-semibold">{result.sku}</span>
                  <Badge variant={statusPill.tone}>{statusPill.label}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{formatDuration(result.duration_ms)}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.error ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {result.error}
                </div>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Selector Health</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{selectorHealth}% healthy</span>
                    <span>
                      {selectorCounts.FOUND}/{selectors.length} FOUND
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${selectorHealth}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {(['FOUND', 'MISSING', 'ERROR', 'SKIPPED'] as const).map((statusKey) => (
                    <div key={statusKey} className="rounded-md border p-2 text-xs">
                      <div className="font-medium">{statusKey}</div>
                      <div className="text-muted-foreground">{selectorCounts[statusKey]}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Extraction Results</h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extractions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground">
                            No extraction events yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        extractions.map((item, index) => (
                          <TableRow key={`${item.field_name}-${index}`}>
                            <TableCell className="font-mono">{item.field_name}</TableCell>
                            <TableCell>
                              <Badge variant={item.status === 'SUCCESS' ? 'default' : item.status === 'EMPTY' ? 'secondary' : 'destructive'}>
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[280px] truncate">
                              {item.field_value || <span className="text-muted-foreground">(empty)</span>}
                            </TableCell>
                            <TableCell>{formatDuration(item.duration_ms)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Product Images</h3>
                <ImageLightbox images={result.images ?? []} />
              </section>

              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">View Raw Data</summary>
                <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
