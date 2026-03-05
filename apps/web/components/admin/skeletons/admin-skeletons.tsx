import { Skeleton } from "@/components/ui/skeleton";

export function AdminTableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filter bar skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-[300px]" />
        <Skeleton className="h-10 w-[150px]" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      {/* Table container skeleton */}
      <div className="rounded-md border">
        <div className="w-full">
          {/* Table header */}
          <div className="flex border-b">
            <div className="w-[50px] p-4">
              <Skeleton className="h-4 w-4" />
            </div>
            <div className="flex-1 p-4">
              <Skeleton className="h-4 w-[150px]" />
            </div>
            <div className="w-[100px] p-4">
              <Skeleton className="h-4 w-[100px]" />
            </div>
            <div className="w-[100px] p-4">
              <Skeleton className="h-4 w-[100px]" />
            </div>
            <div className="w-[80px] p-4">
              <Skeleton className="h-4 w-[80px]" />
            </div>
            <div className="w-[80px] p-4 text-right">
              <Skeleton className="h-4 w-[60px] ml-auto" />
            </div>
          </div>

          {/* Table body */}
          <div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex border-b last:border-0"
              >
                <div className="w-[50px] p-4">
                  <Skeleton className="h-4 w-4" />
                </div>
                <div className="flex-1 p-4">
                  <Skeleton className="h-6 w-[200px]" />
                </div>
                <div className="w-[100px] p-4">
                  <Skeleton className="h-6 w-[100px]" />
                </div>
                <div className="w-[100px] p-4">
                  <Skeleton className="h-6 w-[80px]" />
                </div>
                <div className="w-[80px] p-4">
                  <Skeleton className="h-6 w-[60px]" />
                </div>
                <div className="w-[80px] p-4 flex justify-end gap-2">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-[200px]" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-[200px]" />
          <Skeleton className="h-4 w-[300px]" />
        </div>
        <Skeleton className="h-10 w-[120px]" />
      </div>

      {/* Main content skeleton */}
      <AdminTableSkeleton />
    </div>
  );
}

export function AdminDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-[200px]" />
            <Skeleton className="h-4 w-[150px]" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-[80px]" />
          <Skeleton className="h-9 w-[80px]" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-6 w-[150px]" />
          <Skeleton className="h-[200px] w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-[150px]" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
    </div>
  );
}
