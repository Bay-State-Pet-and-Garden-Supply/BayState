'use client';

import { useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { Plus, Trash2, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfigFormValues } from '../form-schema';
import {
  useTestPolling,
  type TestJobPollData,
  type TestJobResult,
} from '@/lib/admin/scrapers/use-test-polling';

export function TestingTab() {
  const { control, getValues } = useFormContext<ConfigFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const polling = useTestPolling();

  const testSkus = useFieldArray({
    control,
    name: 'test_skus' as never,
  });

  const fakeSkus = useFieldArray({
    control,
    name: 'fake_skus' as never,
  });

  const handleRunTest = useCallback(async () => {
    const values = getValues();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/scrapers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          test_skus: values.test_skus,
          fake_skus: values.fake_skus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to start test' }));
        setSubmitError(errorData.error || 'Failed to start test');
        setIsSubmitting(false);
        return;
      }

      const data = await response.json();
      setIsSubmitting(false);
      polling.startPolling(data.job_id);
    } catch {
      setSubmitError('Network error. Please try again.');
      setIsSubmitting(false);
    }
  }, [getValues, polling]);

  const isRunning = isSubmitting || polling.isPolling;

  const handleReset = useCallback(() => {
    polling.reset();
    setSubmitError(null);
  }, [polling]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Run Test</CardTitle>
          <CardDescription>
            Test the scraper against the configured SKUs to verify it returns expected data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRunTest}
              disabled={isRunning}
            >
              Run Test
            </Button>
            {(polling.data || submitError) && (
              <Button variant="outline" onClick={handleReset}>
                Reset
              </Button>
            )}
          </div>

          {isRunning && (
            <div data-testid="test-loading-indicator" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Running test...</span>
              {polling.progressLabel && (
                <span className="text-xs">({polling.progressLabel})</span>
              )}
            </div>
          )}

          {submitError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>Error: {submitError}</span>
            </div>
          )}

          {polling.error && !isRunning && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{polling.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Results */}
      {polling.data && !polling.isPolling && (
        <TestResults data={polling.data} />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Test SKUs (Known Good)</CardTitle>
            <CardDescription>
              SKUs expected to exist and return valid data. Used for health checks.
            </CardDescription>
          </div>
          <Button onClick={() => testSkus.append('' as never)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add SKU
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {testSkus.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <FormField
                control={control}
                name={`test_skus.${index}`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="e.g. 123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => testSkus.remove(index)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {testSkus.fields.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              No test SKUs defined.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Fake SKUs (Known Bad)</CardTitle>
            <CardDescription>
              SKUs expected to return &quot;Not Found&quot;. Used to verify no-results detection.
            </CardDescription>
          </div>
          <Button onClick={() => fakeSkus.append('' as never)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add SKU
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {fakeSkus.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <FormField
                control={control}
                name={`fake_skus.${index}`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="e.g. 999999-FAKE" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fakeSkus.remove(index)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {fakeSkus.fields.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              No fake SKUs defined.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TestResults({ data }: { data: TestJobPollData }) {
  const { summary, sku_results, status } = data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Test Results</CardTitle>
          {status === 'completed' && (
            <Badge variant={summary.failed === 0 ? 'default' : 'destructive'}>
              {summary.failed === 0 ? 'Passed' : 'Failed'}
            </Badge>
          )}
          {status === 'failed' && (
            <Badge variant="destructive">Failed</Badge>
          )}
        </div>
        <CardDescription>
          {summary.total} total, {summary.passed} passed, {summary.failed} failed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sku_results.map((result: TestJobResult, index: number) => (
          <SkuResultRow key={result.sku || index} result={result} />
        ))}
      </CardContent>
    </Card>
  );
}

function SkuResultRow({ result }: { result: TestJobResult }) {
  const { sku, passed, assertions } = result;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2">
        {passed ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        <span className="font-medium">{sku}</span>
        <Badge variant={passed ? 'default' : 'destructive'}>
          {passed ? 'passed' : 'failed'}
        </Badge>
      </div>

      {!passed && assertions.length > 0 && (
        <div className="ml-6 space-y-1 text-sm">
          {assertions.map((assertion) => (
            <AssertionDiff key={`${sku}-${assertion.field}`} assertion={assertion} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssertionDiff({
  assertion,
}: {
  assertion: { field: string; expected: string | null; actual: string | null; passed: boolean };
}) {
  if (assertion.passed) return null;

  const displayExpected = assertion.expected ?? '—';
  const displayActual = assertion.actual ?? '—';

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="font-mono text-muted-foreground">{assertion.field}:</span>
      <span className="text-muted-foreground">
        expected: <span className="font-medium">{displayExpected}</span>
      </span>
      <span className="text-muted-foreground">
        actual: <span className="font-medium text-destructive">{displayActual}</span>
      </span>
    </div>
  );
}