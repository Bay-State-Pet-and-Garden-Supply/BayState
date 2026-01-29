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
  Beaker,
  RefreshCw,
  Search,
  Filter,
  Download,
  Terminal,
  Eye,
  Code,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TestSku {
  sku: string;
  type: 'golden' | 'fake' | 'edge';
  status?: 'pending' | 'running' | 'success' | 'no_results' | 'error';
  result?: unknown;
  error?: string;
  duration_ms?: number;
}

interface TestRun {
  id: string;
  scraper_id: string;
  scraper_name: string;
  test_type: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
  skus_tested: string[];
  passed_count: number;
  failed_count: number;
}

interface Scraper {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string;
  config: {
    test_skus?: string[];
    fake_skus?: string[];
    edge_case_skus?: string[];
    base_url?: string;
  };
}

interface TestLabClientProps {
  scrapers: Scraper[];
  recentTests: TestRun[];
}

export function TestLabClient({ scrapers, recentTests }: TestLabClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedScraper, setSelectedScraper] = useState<Scraper | null>(null);
  const [testSkus, setTestSkus] = useState<TestSku[]>([]);
  const [newSku, setNewSku] = useState('');
  const [skuType, setSkuType] = useState<'golden' | 'fake' | 'edge'>('golden');
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestSku>>({});
  const [selectedTest, setSelectedTest] = useState<TestRun | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);

  const getScraperConfig = (scraper: Scraper | null) => {
    if (!scraper) return null;
    return scraper.config || { test_skus: [], fake_skus: [], edge_case_skus: [] };
  };

  const initializeTestSkus = (scraper: Scraper) => {
    const config = getScraperConfig(scraper);
    const skus: TestSku[] = [];

    (config.test_skus || []).forEach(sku => {
      skus.push({ sku, type: 'golden' });
    });

    (config.fake_skus || []).forEach(sku => {
      skus.push({ sku, type: 'fake' });
    });

    (config.edge_case_skus || []).forEach(sku => {
      skus.push({ sku, type: 'edge' });
    });

    setTestSkus(skus);
  };

  const handleSelectScraper = (scraperId: string) => {
    const scraper = scrapers.find(s => s.id === scraperId);
    if (scraper) {
      setSelectedScraper(scraper);
      initializeTestSkus(scraper);
      setTestResults({});
    }
  };

  const addSku = () => {
    if (!newSku.trim() || !selectedScraper) return;

    const existing = testSkus.find(s => s.sku === newSku.trim());
    if (existing) {
      toast.error('SKU already in test list');
      return;
    }

    setTestSkus([...testSkus, { sku: newSku.trim(), type: skuType }]);
    setNewSku('');
  };

  const removeSku = (sku: string) => {
    setTestSkus(testSkus.filter(s => s.sku !== sku));
  };

  const runTest = async (sku: string, type: string) => {
    if (!selectedScraper) return;

    setTestResults(prev => ({
      ...prev,
      [sku]: { ...prev[sku], sku, type: type as TestSku['type'], status: 'running' }
    }));

    try {
      const response = await fetch('/api/admin/scraper-network/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scraper_id: selectedScraper.id,
          skus: [sku],
          test_mode: true,
        }),
      });

      if (!response.ok) throw new Error('Test request failed');

      const data = await response.json();

      setTestResults(prev => ({
        ...prev,
        [sku]: {
          ...prev[sku],
          sku,
          type: type as TestSku['type'],
          status: data.status === 'pending' ? 'pending' : data.status === 'success' ? 'success' : data.status === 'no_results' ? 'no_results' : 'error',
          result: data.result,
          error: data.error,
          duration_ms: data.duration_ms,
        }
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [sku]: {
          ...prev[sku],
          sku,
          type: type as TestSku['type'],
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }));
    }
  };

  const runAllTests = async () => {
    if (!selectedScraper || testSkus.length === 0) return;

    setIsRunning(true);
    setTestResults({});

    // Mark all as running
    const runningSkus: Record<string, TestSku> = {};
    for (const sku of testSkus) {
      runningSkus[sku.sku] = { ...sku, status: 'running' };
    }
    setTestResults(runningSkus);

    // Submit all SKUs as a single batch job
    const skus = testSkus.map(s => s.sku);
    try {
      const response = await fetch('/api/admin/scraper-network/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scraper_id: selectedScraper.id,
          skus,
          test_mode: true,
        }),
      });

      if (!response.ok) throw new Error('Test request failed');

      const data = await response.json();

      // Update all SKUs to pending
      const pendingSkus: Record<string, TestSku> = {};
      for (const sku of testSkus) {
        pendingSkus[sku.sku] = {
          ...sku,
          status: 'pending',
        };
      }
      setTestResults(pendingSkus);

      toast.success(`Test job submitted with ${skus.length} SKUs. Results will appear when runners complete.`);
    } catch (error) {
      toast.error(`Failed to submit test job: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTestResults({});
    } finally {
      setIsRunning(false);
      router.refresh();
    }
  };

  const getStatusIcon = (status?: string) => {
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
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      golden: 'bg-green-100 text-green-700',
      fake: 'bg-red-100 text-red-700',
      edge: 'bg-yellow-100 text-yellow-700',
    };
    return (
      <Badge className={colors[type] || 'bg-gray-100'}>
        {type}
      </Badge>
    );
  };

  const testStats = {
    total: testSkus.length,
    passed: testSkus.filter(s => s.status === 'success').length,
    failed: testSkus.filter(s => s.status === 'error').length,
    noResults: testSkus.filter(s => s.status === 'no_results').length,
    pending: testSkus.filter(s => !s.status || s.status === 'pending').length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Beaker className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scraper Test Lab</h1>
            <p className="text-sm text-gray-600">Test and validate scraper configurations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/scrapers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Scrapers
            </Link>
          </Button>
        </div>
      </div>

      {/* Scraper Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Scraper</CardTitle>
          <CardDescription>
            Choose a scraper configuration to test
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select onValueChange={handleSelectScraper} value={selectedScraper?.id}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select a scraper..." />
            </SelectTrigger>
            <SelectContent>
              {scrapers.map((scraper) => (
                <SelectItem key={scraper.id} value={scraper.id}>
                  {scraper.display_name || scraper.slug} ({scraper.config.base_url || `https://${scraper.domain}`})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedScraper && (
        <>
          {/* Test Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* SKU Management */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Test SKUs</CardTitle>
                <CardDescription>
                  Manage SKUs for testing. Golden SKUs should return results, fake SKUs should return 404s.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add SKU Form */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter SKU..."
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSku()}
                    className="flex-1"
                  />
                  <Select value={skuType} onValueChange={(v) => setSkuType(v as 'golden' | 'fake' | 'edge')}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="golden">Golden</SelectItem>
                      <SelectItem value="fake">Fake</SelectItem>
                      <SelectItem value="edge">Edge</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={addSku} disabled={!newSku.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* SKU List */}
                {testSkus.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">
                    No test SKUs configured. Add some SKUs to get started.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {testSkus.map((sku) => (
                      <div
                        key={sku.sku}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(sku.status)}
                          <span className="font-mono text-sm">{sku.sku}</span>
                          {getTypeBadge(sku.type)}
                          {sku.duration_ms && (
                            <span className="text-xs text-gray-500">
                              {sku.duration_ms}ms
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => runTest(sku.sku, sku.type)}
                            disabled={isRunning || sku.status === 'running'}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSku(sku.sku)}
                            disabled={isRunning}
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

            {/* Stats & Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Test Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <p className="text-2xl font-bold">{testStats.total}</p>
                    <p className="text-xs text-gray-600">Total</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{testStats.passed}</p>
                    <p className="text-xs text-green-600">Passed</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{testStats.failed}</p>
                    <p className="text-xs text-red-600">Failed</p>
                  </div>
                  <div className="rounded-lg bg-yellow-50 p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-700">{testStats.noResults}</p>
                    <p className="text-xs text-yellow-600">No Results</p>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={runAllTests}
                  disabled={isRunning || testSkus.length === 0}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Tests...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Run All Tests
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => initializeTestSkus(selectedScraper)}
                  disabled={isRunning}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset Tests
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Results Preview */}
          {Object.keys(testResults).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Latest Test Results</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(testResults).map((result) => (
                      <TableRow key={result.sku}>
                        <TableCell className="font-mono">{result.sku}</TableCell>
                        <TableCell>{getTypeBadge(result.type)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(result.status)}
                            <span className="capitalize">{result.status || 'pending'}</span>
                          </div>
                        </TableCell>
                        <TableCell>{result.duration_ms ? `${result.duration_ms}ms` : '-'}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTest({
                                id: 'manual',
                                scraper_id: selectedScraper.id,
                                scraper_name: selectedScraper.display_name || selectedScraper.slug,
                                test_type: 'manual',
                                status: result.status || 'pending',
                                created_at: new Date().toISOString(),
                                duration_ms: result.duration_ms || null,
                                skus_tested: [result.sku],
                                passed_count: result.status === 'success' ? 1 : 0,
                                failed_count: result.status === 'error' ? 1 : 0,
                              });
                              setShowResultDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Recent Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Test Runs</CardTitle>
          <CardDescription>
            History of all test runs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentTests.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No test runs yet. Run your first test above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Scraper</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SKUs</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTests.slice(0, 10).map((test) => (
                  <TableRow key={test.id}>
                    <TableCell className="text-sm">
                      {format(new Date(test.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {test.scraper_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{test.test_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          test.status === 'passed' ? 'default' :
                          test.status === 'failed' ? 'destructive' :
                          'secondary'
                        }
                      >
                        {test.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{test.skus_tested?.length || 0}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {test.duration_ms ? `${(test.duration_ms / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Test Result Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Test Result Details</DialogTitle>
            <DialogDescription>
              Detailed results for test SKU
            </DialogDescription>
          </DialogHeader>
          {selectedTest && testResults && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Status:</span>{' '}
                  <Badge
                    variant={
                      Object.values(testResults).some(t => t.status === 'success') ? 'default' :
                      Object.values(testResults).some(t => t.status === 'error') ? 'destructive' :
                      'secondary'
                    }
                  >
                    {Object.values(testResults)[0]?.status || 'pending'}
                  </Badge>
                </div>
                <div>
                  <span className="text-gray-600">Duration:</span>{' '}
                  {Object.values(testResults)[0]?.duration_ms}ms
                </div>
              </div>
              <div className="rounded-lg bg-gray-900 p-4 max-h-96 overflow-auto">
                <pre className="text-green-400 text-sm">
                  {JSON.stringify(
                    Object.values(testResults)[0]?.result || {},
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
