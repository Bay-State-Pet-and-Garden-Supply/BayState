import { getScraperBySlug } from '../actions-workbench';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, ExternalLink, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

interface ScraperOverviewProps {
  params: Promise<{ slug: string }>;
}

export default async function ScraperOverviewPage({ params }: ScraperOverviewProps) {
  const { slug } = await params;
  const scraper = await getScraperBySlug(slug);

  if (!scraper) {
    notFound();
  }
  
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="tab-content-overview">
      {/* Quick Actions */}
      <Card className="col-span-full md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks for this scraper</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button variant="outline" asChild>
            <a href={`https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/blob/master/apps/scraper/scrapers/configs/${slug}.yaml`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              View on GitHub
            </a>
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

      {/* Config Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            Config File
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-lg font-mono truncate" title={scraper.file_path || `${slug}.yaml`}>
            {scraper.file_path || `scrapers/configs/${slug}.yaml`}
          </div>
          <div className="mt-3">
            <a 
              href={`https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/blob/master/apps/scraper/${scraper.file_path || `scrapers/configs/${slug}.yaml`}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-[#008850] hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              View on GitHub
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
