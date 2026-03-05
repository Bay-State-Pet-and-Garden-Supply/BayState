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

type ActivityType = 'order' | 'product' | 'pipeline' | 'system';

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: string;
  status?: 'success' | 'warning' | 'info' | 'pending';
  href?: string;
}

interface RecentActivityProps {
  activities: Activity[];
  maxItems?: number;
}

const activityIcons: Record<ActivityType, LucideIcon> = {
  order: ShoppingCart,
  product: Package,
  pipeline: CheckCircle,
  system: AlertCircle,
};

const statusStyles = {
  success: 'bg-green-100 text-green-700',
  warning: 'bg-orange-100 text-orange-700',
  info: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

export function RecentActivity({ activities, maxItems = 5 }: RecentActivityProps) {
  const displayActivities = activities.slice(0, maxItems);

  if (displayActivities.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Clock className="mr-2 h-5 w-5" />
          <span>No recent activity</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
      <div className="space-y-4">
        {displayActivities.map((activity) => {
          const Icon = activityIcons[activity.type];
          const content = (
            <div
              key={activity.id}
              className={`flex items-start gap-3 rounded-lg p-3 transition-colors ${
                activity.href ? 'hover:bg-muted/50 cursor-pointer' : ''
              }`}
            >
              <div
                className={`rounded-full p-2 ${
                  activity.status
                    ? statusStyles[activity.status]
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {activity.title}
                </p>
                {activity.description && (
                  <p className="text-sm text-muted-foreground truncate">
                    {activity.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {formatDistanceToNow(new Date(activity.timestamp), {
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
    </div>
  );
}
