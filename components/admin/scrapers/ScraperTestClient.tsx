'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  FileCode,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { ScraperRecord, TestRunRecord } from '@/lib/admin/scrapers/types';
import { ScraperStatusBadge, ScraperHealthBadge } from './ScraperStatusBadge';
import { updateScraper } from '@/app/admin/scrapers/actions';

interface ScraperTestClientProps {
  scraper: ScraperRecord;
  recentTests: TestRunRecord[];
}

type SkuType = 'test' | 'fake';

export function ScraperTestClient({ scraper, recentTests }: ScraperTestClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  const [testSkus, setTestSkus] = useState<string[]>(scraper.config?.test_skus || []);
  const [fakeSkus, setFakeSkus] = useState<string[]>(scraper.config?.fake_skus || []);
  const [newTestSku, setNewTestSku] = useState('');
  const [newFakeSku, setNewFakeSku] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { status: string; data?: unknown; error?: string }>>({});

  const addSku = (type: SkuType) => {
    const value = type === 'test' ? newTestSku.trim() : newFakeSku.trim();
    if (!value) return;

    const skus = type === 'test' ? testSkus : fakeSkus;
    if (skus.includes(value)) {
      toast.error('SKU already exists');
      return;
    }

    const newSkus = [...skus, value];
    if (type === 'test') {
      setTestSkus(newSkus);
      setNewTestSku('');
    } else {
      setFakeSkus(newSkus);
      setNewFakeSku('');
    }

    saveSkus(type, newSkus);
  };

  const removeSku = (type: SkuType, sku: string) => {
    const skus = type === 'test' ? testSkus : fakeSkus;
    const newSkus = skus.filter((s) => s !== sku);
    
    if (type === 'test') {
      setTestSkus(newSkus);
    } else {
      setFakeSkus(newSkus);
    }

    saveSkus(type, newSkus);
  };

  const saveSkus = (type: SkuType, skus: string[]) => {
    startTransition(async () => {
      const config = { ...scraper.config };
      if (type === 'test') {
        config.test_skus = skus;
      } else {
        config.fake_skus = skus;
      }

      const result = await updateScraper(scraper.id, { config });
      if (!result.success) {
        toast.error('Failed to save SKUs');
      }
    });
  };

  const runTest = async (sku: string, skuType: SkuType) => {
    setTestResults((prev) => ({ ...prev, [sku]: { status: 'running' } }));
    
    try {
      const response = await fetch('/api/admin/scraper-network/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scraper_id: scraper.id,
          sku,
          sku_type: skuType,
        }),
      });

      if (!response.ok) {
        throw new Error('Test request failed');
      }

      const data = await response.json();
      setTestResults((prev) => ({
        ...prev,
        [sku]: { status: data.status, data: data.result, error: data.error },
      }));

      if (data.status === 'success') {
        toast.success(`Test passed for ${sku}`);
      } else if (data.status === 'no_results' && skuType === 'fake') {
        toast.success(`Correctly detected no results for fake SKU ${sku}`);
      } else {
        toast.error(`Test failed for ${sku}: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [sku]: { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      }));
      toast.error(`Failed to run test for ${sku}`);
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setTestResults({});

    for (const sku of testSkus) {
      await runTest(sku, 'test');
    }
    for (const sku of fakeSkus) {
      await runTest(sku, 'fake');
    }

    setIsRunning(false);
    router.refresh();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'no_results':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTestRunStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      passed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      partial: 'bg-yellow-100 text-yellow-700',
      running: 'bg-blue-100 text-blue-700',
      pending: 'bg-gray-100 text-gray-700',
    };
    return (
      <Badge variant="outline" className={colors[status] || colors.pending}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/scrapers/${scraper.id}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Editor
            </Link>
          </Button>
          <div className="h-6 w-px bg-gray-300" />
          <div className="flex items-center gap-3">
            <FileCode className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-lg font-semibold">
                Test: {scraper.display_name || scraper.name}
              </h1>
              <p className="text-xs text-gray-600">{scraper.base_url}</p>
            </div>
          </div>
          <ScraperStatusBadge status={scraper.status} />
          <ScraperHealthBadge health={scraper.health_status} score={scraper.health_score} />
        </div>

        <Button onClick={runAllTests} disabled={isRunning || (testSkus.length === 0 && fakeSkus.length === 0)}>
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run All Tests
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test SKUs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test SKUs</CardTitle>
            <CardDescription>
              SKUs that should return valid product data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter a test SKU..."
                value={newTestSku}
                onChange={(e) => setNewTestSku(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSku('test')}
              />
              <Button onClick={() => addSku('test')} disabled={isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {testSkus.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-4">
                No test SKUs configured
              </p>
            ) : (
              <div className="space-y-2">
                {testSkus.map((sku) => (
                  <div key={sku} className="flex items-center justify-between rounded-lg border p-2">
                    <div className="flex items-center gap-2">
                      {testResults[sku] ? getStatusIcon(testResults[sku].status) : null}
                      <span className="font-mono text-sm">{sku}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runTest(sku, 'test')}
                        disabled={isRunning}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSku('test', sku)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fake SKUs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fake SKUs</CardTitle>
            <CardDescription>
              SKUs that should return &quot;no results&quot; (negative test)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter a fake SKU..."
                value={newFakeSku}
                onChange={(e) => setNewFakeSku(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSku('fake')}
              />
              <Button onClick={() => addSku('fake')} disabled={isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {fakeSkus.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-4">
                No fake SKUs configured
              </p>
            ) : (
              <div className="space-y-2">
                {fakeSkus.map((sku) => (
                  <div key={sku} className="flex items-center justify-between rounded-lg border p-2">
                    <div className="flex items-center gap-2">
                      {testResults[sku] ? getStatusIcon(testResults[sku].status) : null}
                      <span className="font-mono text-sm">{sku}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runTest(sku, 'fake')}
                        disabled={isRunning}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSku('fake', sku)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Test Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Test Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTests.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-8">
              No test runs yet. Run your first test above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SKUs Tested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTests.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-sm">
                      {run.started_at ? format(new Date(run.started_at), 'MMM d, h:mm a') : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{run.test_type}</Badge>
                    </TableCell>
                    <TableCell>{run.skus_tested?.length || 0}</TableCell>
                    <TableCell>{getTestRunStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
