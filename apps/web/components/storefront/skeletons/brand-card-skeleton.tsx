import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function BrandCardSkeleton() {
  return (
    <div className="h-full">
      <Card className="h-full border-[oklch(85%_0.03_160)] shadow-sm">
        <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <Skeleton className="h-24 w-24 rounded-full" />
          
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    </div>
  );
}
