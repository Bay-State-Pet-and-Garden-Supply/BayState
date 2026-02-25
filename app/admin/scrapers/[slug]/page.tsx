import { getScraperBySlug } from '../actions-workbench';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Beaker, Clock, Edit, FileText, Play } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

interface ScraperOverviewProps {
  params: Promise<{ slug: string }>;
}

async function getRecentTestRuns(scraperId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('scraper_test_runs')
    .select('id, status, created_at')
    .eq('scraper_id', scraperId)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error('Failed to fetch test runs:', error);
    return [];
  }
  return data || [];
}

export default async function ScraperOverviewPage({ params }: ScraperOverviewProps) {
  const { slug } = await params;
  const scraper = await getScraperBySlug(slug);

  if (!scraper) {
    notFound();
  }
  
  const testRuns = scraper.id ? await getRecentTestRuns(scraper.id) : [];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Quick Actions */}
      <Card className="col-span-full md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks for this scraper</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild>
            <Link href={`/admin/scrapers/${slug}/test-lab/new`}>
              <Play className="mr-2 h-4 w-4" />
              Run Test
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/admin/scrapers/${slug}/configuration`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Config
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/admin/scrapers/${slug}/workflows`}>
              <Activity className="mr-2 h-4 w-4" />
              View Workflows
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Health Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            Health Score
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold tracking-tight">
            {scraper.health_score !== undefined && scraper.health_score !== null 
              ? `${scraper.health_score}%` 
              : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Status: <span className="capitalize">{scraper.health_status || 'Unknown'}</span>
          </p>
        </CardContent>
      </Card>

      {/* Test Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            Last Test Run
            <Beaker className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold capitalize">
            {testRuns.length > 0 ? testRuns[0].status : 'No Runs'}
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center">
            <Clock className="mr-1 h-3 w-3" />
            {testRuns.length > 0 
              ? new Date(testRuns[0].created_at).toLocaleDateString() 
              : 'Never'}
          </p>
        </CardContent>
      </Card>

      {/* Config Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            Config Version
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-lg font-mono truncate" title={scraper.current_version_id || 'v1.0.0'}>
            {scraper.current_version_id 
              ? scraper.current_version_id.split('-')[0] 
              : 'v1.0.0'}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Updated recently
          </p>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Recent Test Activity</CardTitle>
          <CardDescription>The last 5 test runs for this scraper</CardDescription>
        </CardHeader>
        <CardContent>
          {testRuns.length > 0 ? (
            <div className="space-y-4">
              {testRuns.map((run) => (
                <div key={run.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center space-x-4">
                    <div className={`w-2 h-2 rounded-full ${
                      run.status === 'passed' ? 'bg-green-500' : 
                      run.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium">Run {run.id.split('-')[0]}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(run.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm capitalize font-medium">
                    {run.status}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No test runs recorded yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
