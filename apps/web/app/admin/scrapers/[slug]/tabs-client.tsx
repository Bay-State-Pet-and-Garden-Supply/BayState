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
      <div className="overflow-x-auto pb-2 -mb-2">
        <TabsList className="inline-flex h-11 w-max min-w-full justify-start rounded-md bg-muted p-1 text-muted-foreground" data-testid="workbench-tabs-list">
          <TabsTrigger value="overview" asChild className="min-w-[120px] h-9">
            <Link href={`/admin/scrapers/${slug}`} data-testid="tab-overview">
              <Activity className="w-4 h-4 mr-2" />
              Overview
            </Link>
          </TabsTrigger>
          <TabsTrigger value="configuration" asChild className="min-w-[120px] h-9">
            <Link href={`/admin/scrapers/${slug}/configuration`} data-testid="tab-configuration">
              <Settings className="w-4 h-4 mr-2" />
              Configuration
            </Link>
          </TabsTrigger>
          <TabsTrigger value="credentials" asChild className="min-w-[120px] h-9">
            <Link href={`/admin/scrapers/${slug}/credentials`} data-testid="tab-credentials">
              <ShieldCheck className="w-4 h-4 mr-2" />
              Credentials
            </Link>
          </TabsTrigger>
          <TabsTrigger value="test-lab" asChild className="min-w-[120px] h-9">
            <Link href={`/admin/scrapers/${slug}/test-lab`} data-testid="tab-test-lab">
              <Beaker className="w-4 h-4 mr-2" />
              Test Lab
            </Link>
          </TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  );
}
