import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getScraperBySlug } from '../actions-workbench';
import { StatusBadge } from '@/components/ui/status-badge';
import { Metadata } from 'next';
import { ScraperTabsClient } from './tabs-client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Globe, Terminal } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Scraper Workbench',
  description: 'Manage individual scraper configuration, workflows, and tests',
};

interface ScraperLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function ScraperWorkbenchLayout({
  children,
  params,
}: ScraperLayoutProps) {
  const { slug } = await params;
  const scraper = await getScraperBySlug(slug);

  if (!scraper) {
    notFound();
  }

  return (
    <div className="flex flex-col h-full space-y-6" data-testid="scraper-workbench">
      {/* Redesigned Header with Back Arrow */}
      <div className="bg-card border-b -mx-8 -mt-8 px-8 py-6 mb-2 shadow-sm">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 w-8 p-0">
              <Link href="/admin/scrapers/list">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-[#66161D]" data-testid="scraper-workbench-title">
                  {scraper.display_name || scraper.name || slug}
                </h1>
                <StatusBadge 
                  status={scraper.status || 'unknown'} 
                />
                <StatusBadge 
                  status={scraper.health_status || 'unknown'} 
                />
              </div>
              <div className="flex items-center text-muted-foreground text-xs gap-4">
                <div className="flex items-center gap-1.5 font-mono">
                  <Terminal className="h-3 w-3" />
                  {slug}
                </div>
                {scraper.base_url && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3 w-3" />
                    {scraper.base_url}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="pt-2">
            <ScraperTabsClient slug={slug} />
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0" data-testid="workbench-content">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
