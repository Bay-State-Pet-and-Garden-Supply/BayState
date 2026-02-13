// DEPRECATED: This route is deprecated. Use /admin/scrapers/studio instead.
// Redirects are configured in next.config.ts to maintain backward compatibility.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Beaker } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TimelineStepDisplayRealtime } from '@/app/admin/scrapers/studio/TimelineStepDisplayRealtime';

interface TestRunStep {
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

interface TestRun {
  id: string;
  scraper_id: string;
  scraper_name?: string;
  test_type: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
  skus_tested: string[];
  passed_count: number;
  failed_count: number;
  config?: {
    workflow_steps?: string[];
  };
}

interface Scraper {
  id: string;
  name: string;
  display_name: string | null;
  base_url: string | null;
  config?: Record<string, unknown>;
}

async function getTestRun(id: string): Promise<TestRun | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scraper_test_runs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error fetching test run:', error);
    return null;
  }

  return {
    id: data.id,
    scraper_id: data.scraper_id,
    test_type: data.test_type || 'manual',
    status: data.status || 'unknown',
    created_at: data.created_at,
    duration_ms: data.duration_ms || null,
    skus_tested: data.skus_tested || [],
    passed_count: data.passed_count || 0,
    failed_count: data.failed_count || 0,
    config: data.config as Record<string, unknown> | undefined,
  };
}

async function getScraper(scraperId: string): Promise<Scraper | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scrapers')
    .select('id, name, display_name, base_url, config')
    .eq('id', scraperId)
    .single();

  if (error || !data) {
    console.error('Error fetching scraper:', error);
    return null;
  }

  return data as unknown as Scraper;
}

async function getTestRunSteps(testRunId: string): Promise<TestRunStep[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scraper_test_run_steps')
    .select('*')
    .eq('test_run_id', testRunId)
    .order('step_index', { ascending: true });

  if (error) {
    console.error('Error fetching test run steps:', error);
    return [];
  }

  return (data || []) as TestRunStep[];
}

// Default workflow steps to show as placeholder when no steps recorded
const DEFAULT_WORKFLOW_STEPS = [
  'initialize',
  'navigate',
  'wait_for_selectors',
  'extract_data',
  'validate_data',
  'submit_results',
];

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
    case 'passed':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'secondary';
    default:
      return 'outline';
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default async function TestRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const [testRun, steps] = await Promise.all([
    getTestRun(id),
    getTestRunSteps(id),
  ]);

  if (!testRun) {
    notFound();
  }

  const scraper = await getScraper(testRun.scraper_id);
  const scraperName = scraper?.display_name || scraper?.name || 'Unknown Scraper';

  // Determine which steps to display (from DB or placeholder)
  const displaySteps = steps.length > 0 ? steps : DEFAULT_WORKFLOW_STEPS.map((action, index) => ({
    id: `placeholder-${index}`,
    test_run_id: id,
    step_index: index + 1,
    action_type: action,
    status: 'pending' as const,
    started_at: null,
    completed_at: null,
    duration_ms: null,
    error_message: null,
    extracted_data: null,
    created_at: testRun.created_at,
  }));

  // Calculate overall progress
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const failedSteps = steps.filter(s => s.status === 'failed').length;
  const runningSteps = steps.filter(s => s.status === 'running').length;
  const hasSteps = steps.length > 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Beaker className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Test Run Details</h1>
            <p className="text-sm text-gray-600">
              {scraperName} • {format(new Date(testRun.created_at), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/scrapers/test-lab">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Test Lab
            </Link>
          </Button>
        </div>
      </div>

      {/* Test Run Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={getStatusBadgeVariant(testRun.status)} className="text-sm">
              {testRun.status}
            </Badge>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {formatDuration(testRun.duration_ms)}
            </span>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">SKUs Tested</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {testRun.skus_tested?.length || 0}
            </span>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-green-600">
                {testRun.passed_count} passed
              </span>
              <span className="text-lg font-bold text-red-600">
                {testRun.failed_count} failed
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow Steps</CardTitle>
          <CardDescription>
            {hasSteps 
              ? `Execution timeline (${completedSteps} completed, ${failedSteps} failed, ${runningSteps} running)`
              : 'No step data recorded yet. Showing expected workflow steps.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineStepDisplayRealtime 
            initialSteps={displaySteps} 
            testRunId={id}
          />
        </CardContent>
      </Card>

      {/* SKUs Tested */}
      {testRun.skus_tested && testRun.skus_tested.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>SKUs Tested</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {testRun.skus_tested.map((sku) => (
                <Badge key={sku} variant="outline" className="font-mono">
                  {sku}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
