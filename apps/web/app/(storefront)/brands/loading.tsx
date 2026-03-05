import { BrandCardSkeleton } from '@/components/storefront/skeletons/brand-card-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 relative">
      <aside className="lg:w-16 flex-shrink-0">
        <div className="sticky top-24 flex lg:flex-col flex-wrap gap-2 justify-center lg:justify-start py-4 lg:py-0">
          {Array.from({ length: 26 }).map((_, i) => (
            <Skeleton key={i} className="w-8 h-8 rounded-md" />
          ))}
        </div>
      </aside>

      <div className="flex-1 space-y-12">
        {Array.from({ length: 3 }).map((_, sectionIndex) => (
          <div key={sectionIndex}>
            <div className="flex items-center gap-4 mb-6 border-b pb-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-4 w-20" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {Array.from({ length: 10 }).map((_, i) => (
                <BrandCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
