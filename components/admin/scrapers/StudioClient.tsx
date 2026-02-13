'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReactNode, Suspense } from 'react';

import StudioHealthDashboard from './studio/health/StudioHealthDashboard';
import StepMetricsDashboard from './studio/health/StepMetricsDashboard';
import { HealthDashboardSkeleton } from './studio/health/HealthDashboardSkeleton';
import { StepMetricsSkeleton } from './studio/health/StepMetricsSkeleton';
import { TestRunHistory } from '@/components/admin/scraper-studio/TestRunHistory';
import { StudioErrorBoundary } from './studio/StudioErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';

interface StudioClientProps {
  configsSlot?: ReactNode;
}

function TestRunHistorySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[100px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StudioClient({ configsSlot }: StudioClientProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scraper Studio</h1>
          <p className="text-muted-foreground">
            Advanced environment for scraper development, testing, and monitoring.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          v1.0.0-beta
        </div>
      </div>

      <Tabs defaultValue="configs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configs">Configs</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="configs" className="space-y-4">
          {configsSlot}
        </TabsContent>
        <TabsContent value="testing" className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Testing interface will appear here.
          </div>
        </TabsContent>
        <TabsContent value="health" className="space-y-6">
          <StudioErrorBoundary componentName="Health Dashboard">
            <Suspense fallback={<HealthDashboardSkeleton />}>
              <StudioHealthDashboard />
            </Suspense>
          </StudioErrorBoundary>
          <StudioErrorBoundary componentName="Step Metrics">
            <Suspense fallback={<StepMetricsSkeleton />}>
              <StepMetricsDashboard />
            </Suspense>
          </StudioErrorBoundary>
        </TabsContent>
        <TabsContent value="history" className="space-y-4">
          <StudioErrorBoundary componentName="Test Run History">
            <Suspense fallback={<TestRunHistorySkeleton />}>
              <TestRunHistory />
            </Suspense>
          </StudioErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
