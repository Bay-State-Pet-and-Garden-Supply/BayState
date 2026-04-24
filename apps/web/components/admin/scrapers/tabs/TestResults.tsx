'use client';

import { useState } from 'react';
import {
  Badge,
} from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface SkuAssertion {
  field: string;
  expected: string | null;
  actual: string | null;
  passed: boolean;
}

export interface SkuResult {
  sku: string;
  passed: boolean;
  assertions: SkuAssertion[];
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
}

export interface TestRunData {
  job_id?: string;
  status?: string;
  results: SkuResult[];
  summary: TestRunSummary;
  duration_ms?: number;
  runner_name?: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string | null;
}

interface TestResultsProps {
  data: TestRunData | null;
  error: string | null;
}

export function TestResults({ data, error }: TestResultsProps) {
  const [selectedSku, setSelectedSku] = useState<SkuResult | null>(null);

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive font-medium">
            Test execution failed. Check runner logs.
          </p>
          {error && (
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.results.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground italic">
            No test results yet. Click Run Test to start.
          </p>
        </CardContent>
      </Card>
    );
  }

  const passedResults = data.results.filter((r) => r.passed);
  const failedResults = data.results.filter((r) => !r.passed);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
          <CardDescription>
            {data.summary.total} total · {data.summary.passed} passed ·{' '}
            {data.summary.failed} failed
            {data.duration_ms ? ` · ${data.duration_ms}ms` : ''}
            {data.runner_name ? ` · ${data.runner_name}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {failedResults.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase tracking-tighter text-brand-burgundy">
                Failed ({failedResults.length})
              </h4>
              {failedResults.map((result) => (
                <button
                  key={result.sku}
                  type="button"
                  className="w-full text-left border-2 border-brand-burgundy p-3 space-y-2 bg-white hover:bg-zinc-50 transition-colors"
                  onClick={() => setSelectedSku(result)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">
                      {result.sku}
                    </span>
                    <Badge variant="destructive">Failed</Badge>
                  </div>
                  <div className="space-y-2">
                    {result.assertions.map((assertion) => (
                      <div
                        key={assertion.field}
                        className="grid grid-cols-3 gap-2 text-sm items-center"
                      >
                        <span className="font-black uppercase tracking-tighter text-xs">
                          {assertion.field}
                        </span>
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-tighter">
                            Expected
                          </span>
                          <p className="font-mono">
                            {assertion.expected ?? '(empty)'}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-tighter">
                            Actual
                          </span>
                          <p className="font-mono">
                            {assertion.actual ?? '(empty)'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {passedResults.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase tracking-tighter text-brand-forest-green">
                Passed ({passedResults.length})
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assertions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {passedResults.map((result) => {
                    const passedCount = result.assertions.filter(
                      (a) => a.passed
                    ).length;
                    const totalCount = result.assertions.length;
                    return (
                      <TableRow key={result.sku}>
                        <TableCell className="font-mono text-sm">
                          {result.sku}
                        </TableCell>
                        <TableCell>
                          <Badge variant="success">Passed</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {passedCount}/{totalCount} passed
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedSku}
        onOpenChange={(open) => !open && setSelectedSku(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedSku?.sku}</DialogTitle>
            <DialogDescription>
              Assertion details for SKU {selectedSku?.sku}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedSku?.assertions.map((assertion) => (
              <div
                key={assertion.field}
                className={`p-3 border-2 ${
                  assertion.passed
                    ? 'border-brand-forest-green'
                    : 'border-brand-burgundy'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black uppercase tracking-tighter text-sm">
                    {assertion.field}
                  </span>
                  <Badge
                    variant={assertion.passed ? 'success' : 'destructive'}
                  >
                    {assertion.passed ? 'Passed' : 'Failed'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs font-black uppercase tracking-tighter text-muted-foreground">
                      Expected
                    </span>
                    <p className="mt-1 font-mono">
                      {assertion.expected ?? '(empty)'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-tighter text-muted-foreground">
                      Actual
                    </span>
                    <p className="mt-1 font-mono">
                      {assertion.actual ?? '(empty)'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
