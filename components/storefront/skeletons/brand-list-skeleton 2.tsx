import { BrandCardSkeleton } from "./brand-card-skeleton"

/**
 * BrandListSkeleton - Loading skeleton for brand grid layouts.
 * Provides a consistent loading state for brand listing pages.
 *
 * @example
 * <BrandListSkeleton count={10} />
 */
interface BrandListSkeletonProps {
  count?: number
  columns?: 3 | 4 | 5 | 6
}

const columnClasses = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
}

export function BrandListSkeleton({
  count = 10,
  columns = 5,
}: BrandListSkeletonProps) {
  return (
    <div className={`grid gap-6 ${columnClasses[columns]}`}>
      {Array.from({ length: count }).map((_, i) => (
        <BrandCardSkeleton key={i} />
      ))}
    </div>
  )
}
