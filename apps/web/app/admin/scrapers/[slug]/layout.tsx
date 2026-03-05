import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getScraperBySlug } from '../actions-workbench';
import { StatusBadge } from '@/components/ui/status-badge';
import { Metadata } from 'next';
import { ScraperTabsClient } from './tabs-client';

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
    <div className="flex flex-col h-full space-y-4" data-testid="scraper-workbench">
      {/* Header section with tabs inline */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between pb-4 border-b">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="scraper-workbench-title">
              {scraper.display_name || scraper.name || slug}
            </h1>
            <StatusBadge 
              status={scraper.status || 'unknown'} 
            />
            <StatusBadge 
              status={scraper.health_status || 'unknown'} 
            />
          </div>
          <div className="flex items-center text-muted-foreground text-sm gap-2 mt-2">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
              {slug}
            </span>
            {scraper.domain && (
              <>
                <span>•</span>
                <span>{scraper.domain}</span>
              </>
            )}
          </div>
        </div>
        {/* Tabs navigation - inline with heading */}
        <ScraperTabsClient slug={slug} />
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0" data-testid="workbench-content">
        {children}
      </div>
    </div>
  );
}
