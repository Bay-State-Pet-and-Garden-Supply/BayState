import { B2BFeed } from '@/lib/b2b/types';
import { FeedCard } from './feed-card';

interface FeedGridProps {
  feeds: B2BFeed[];
}

export function FeedGrid({ feeds }: FeedGridProps) {
  if (feeds.length === 0) {
    return (
      <div className="text-center p-8 border rounded-lg bg-muted/20">
        <p className="text-muted-foreground">No feed configurations found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {feeds.map((feed) => (
        <FeedCard key={feed.id} feed={feed} />
      ))}
    </div>
  );
}

export function FeedGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
          <div className="flex justify-between items-start">
             <div className="h-4 w-24 bg-muted animate-pulse rounded" />
             <div className="h-5 w-12 bg-muted animate-pulse rounded-full" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
                <div className="h-4 w-4 bg-muted animate-pulse rounded-full" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="h-4 w-20 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex gap-2 pt-4">
             <div className="h-9 w-full bg-muted animate-pulse rounded" />
             <div className="h-9 w-full bg-muted animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
