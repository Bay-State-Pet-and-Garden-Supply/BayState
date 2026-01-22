import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * TableSkeleton - Loading skeleton for data table layouts.
 * Provides a consistent loading state for admin data tables.
 *
 * @example
 * <TableSkeleton rows={5} columns={4} />
 */
interface TableSkeletonProps {
  rows?: number
  columns?: number
  showHeader?: boolean
  className?: string
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      {showHeader && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      )}

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4 py-3 border-t"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * DataTableSkeleton - A more complete data table skeleton with search and actions.
 * For admin pages with full table controls.
 *
 * @example
 * <DataTableSkeleton searchPlaceholder="Loading..." showActions />
 */
interface DataTableSkeletonProps {
  rows?: number
  columns?: number
  showSearch?: boolean
  showActions?: boolean
  className?: string
}

export function DataTableSkeleton({
  rows = 5,
  columns = 4,
  showSearch = true,
  showActions = true,
  className,
}: DataTableSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-full max-w-sm" />
          <div className="flex gap-2">
            {showActions && (
              <>
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-20" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <TableSkeleton rows={rows} columns={columns + (showActions ? 1 : 0)} />
    </div>
  )
}
