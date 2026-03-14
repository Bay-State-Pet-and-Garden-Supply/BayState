'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Beaker, Settings, ShieldCheck } from 'lucide-react';

interface ScraperTabsClientProps {
  slug: string;
}

export function ScraperTabsClient({ slug }: ScraperTabsClientProps) {
  const pathname = usePathname();
  
  // Determine active tab from pathname
  const segments = pathname.split('/').filter(Boolean);
  // URL pattern: /admin/scrapers/[slug]/[tab]
  const tabSegment = segments.length > 3 ? segments[3] : 'overview';
  
  return (
    <Tabs value={tabSegment} className="w-full" data-testid="workbench-tabs">
      <div className="overflow-x-auto">
        <TabsList className="inline-flex h-10 items-center justify-start rounded-none border-b bg-transparent p-0 text-muted-foreground" data-testid="workbench-tabs-list">
          <TabsTrigger 
            value="overview" 
            asChild 
            className="inline-flex items-center justify-center whitespace-nowrap py-2 pr-4 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:border-[#66161D] data-[state=active]:text-foreground data-[state=active]:shadow-none rounded-none bg-transparent"
          >
            <Link href={`/admin/scrapers/${slug}`} data-testid="tab-overview">
              <Activity className="w-4 h-4 mr-2" />
              Overview
            </Link>
          </TabsTrigger>
          <TabsTrigger 
            value="configuration" 
            asChild 
            className="inline-flex items-center justify-center whitespace-nowrap py-2 px-4 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:border-[#66161D] data-[state=active]:text-foreground data-[state=active]:shadow-none rounded-none bg-transparent"
          >
            <Link href={`/admin/scrapers/${slug}/configuration`} data-testid="tab-configuration">
              <Settings className="w-4 h-4 mr-2" />
              Configuration
            </Link>
          </TabsTrigger>
          <TabsTrigger 
            value="credentials" 
            asChild 
            className="inline-flex items-center justify-center whitespace-nowrap py-2 px-4 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:border-[#66161D] data-[state=active]:text-foreground data-[state=active]:shadow-none rounded-none bg-transparent"
          >
            <Link href={`/admin/scrapers/${slug}/credentials`} data-testid="tab-credentials">
              <ShieldCheck className="w-4 h-4 mr-2" />
              Credentials
            </Link>
          </TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  );
}
