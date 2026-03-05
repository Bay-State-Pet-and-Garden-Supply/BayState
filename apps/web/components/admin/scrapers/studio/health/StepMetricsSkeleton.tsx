'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function StepMetricsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 mt-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-[160px]" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-[160px]" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-2">
                <Skeleton className="h-4 w-[150px]" />
                <Skeleton className="h-6 w-[60px]" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
