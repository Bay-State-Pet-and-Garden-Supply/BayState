'use client';

import { Clock } from 'lucide-react';
import type { OrderEvent } from '@/lib/orders';

interface OrderTimelineProps {
  events: OrderEvent[];
}

const eventLabels: Record<string, string> = {
  status_changed: 'Status Changed',
  order_cancelled: 'Order Cancelled',
  order_archived: 'Order Archived',
  payment_voided: 'Payment Voided',
  payment_status_changed: 'Payment Updated',
  fulfillment_status_changed: 'Fulfillment Updated',
  imported_from_shopsite: 'Imported from ShopSite',
  imported_from_integra: 'Imported from Integra Register',
};

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEventLabel(event: OrderEvent): string {
  const base = eventLabels[event.event_type] ?? event.event_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  if (event.previous_value && event.new_value) {
    // Check for simple string transitions
    const prevVal = typeof event.previous_value === 'object' && event.previous_value !== null
      ? Object.values(event.previous_value as Record<string, unknown>)[0]
      : null;
    const newVal = typeof event.new_value === 'object' && event.new_value !== null
      ? Object.values(event.new_value as Record<string, unknown>)[0]
      : null;

    if (prevVal && newVal && typeof prevVal === 'string' && typeof newVal === 'string') {
      return `${base}: ${formatValue(prevVal)} → ${formatValue(newVal)}`;
    }
  }

  return base;
}

function formatValue(val: string): string {
  return val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function OrderTimeline({ events }: OrderTimelineProps) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No events recorded.</p>;
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="relative space-y-0">
      {sorted.map((event, idx) => (
        <div key={event.id} className="flex gap-3 pb-4 last:pb-0">
          {/* Timeline line + dot */}
          <div className="flex flex-col items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 ring-2 ring-background z-10" />
            {idx < sorted.length - 1 && (
              <div className="w-px flex-1 bg-border mt-0.5" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground truncate">
                {formatEventLabel(event)}
              </p>
              <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(event.created_at)}
              </span>
            </div>
            {event.note && (
              <p className="text-xs text-muted-foreground mt-0.5">{event.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
