import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ProductCardSkeleton() {
  return (
    <div className="h-full">
      <Card className="h-full border-zinc-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="flex h-full flex-col p-0">
          <div className="relative aspect-square w-full bg-zinc-50">
            <Skeleton className="h-full w-full rounded-none" />
          </div>

          <div className="flex flex-1 flex-col p-4">
            <Skeleton className="mb-2 h-3 w-1/3" />
            
            <Skeleton className="mb-1 h-4 w-full" />
            <Skeleton className="mb-4 h-4 w-2/3" />

            <div className="mt-auto flex items-end justify-between pt-2">
              <Skeleton className="h-7 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
