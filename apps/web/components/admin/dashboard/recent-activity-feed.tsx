import React from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { 
  ShoppingCart, 
  Package, 
  CheckCircle, 
  AlertCircle,
  Clock,
  type LucideIcon 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRecentActivity } from '@/hooks/use-recent-activity';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const activityIcons: Record<string, LucideIcon> = {
  order: ShoppingCart,
  product: Package,
  pipeline: CheckCircle,
  system: AlertCircle,
};

const statusStyles = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export function RecentActivityFeed({ limit = 5 }: { limit?: number }) {
  const { activities, loading, error } = useRecentActivity(limit);

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-sm">Failed to load activity</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-center">
            <Clock className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type] || activityIcons.system;
              const content = (
                <div
                  className={cn(
                    "flex items-start gap-3 rounded-lg p-2 transition-colors",
                    activity.href ? "hover:bg-muted/50 cursor-pointer" : ""
                  )}
                >
                  <div
                    className={cn(
                      "rounded-full p-2 shrink-0",
                      activity.status
                        ? statusStyles[activity.status]
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {activity.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {activity.description}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(activity.activity_timestamp), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              );

              if (activity.href) {
                return (
                  <Link key={activity.id} href={activity.href}>
                    {content}
                  </Link>
                );
              }

              return <div key={activity.id}>{content}</div>;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
