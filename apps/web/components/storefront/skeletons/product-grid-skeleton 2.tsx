import { ProductCardSkeleton } from "./product-card-skeleton"

/**
 * ProductGridSkeleton - Loading skeleton for product grid layouts.
 * Provides a consistent loading state for product listing pages.
 *
 * @example
 * <ProductGridSkeleton count={8} />
 */
interface ProductGridSkeletonProps {
  count?: number
  columns?: 2 | 3 | 4 | 5 | 6
}

const columnClasses = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
}

export function ProductGridSkeleton({
  count = 8,
  columns = 4,
}: ProductGridSkeletonProps) {
  return (
    <div className={`grid gap-4 ${columnClasses[columns]}`}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}
