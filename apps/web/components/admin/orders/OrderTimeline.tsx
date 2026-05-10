'use client';

import { Clock, CheckCircle, XCircle, Upload, RefreshCw, CreditCard, Package, Info } from 'lucide-react';
import type { OrderEvent } from '@/lib/orders';

const eventIcons: Record<string, React.ElementType> = {
  imported_from_shopsite: Upload,
  imported_from_integra: Upload,
  status_changed: RefreshCw,
  payment_status_changed: CreditCard,
  fulfillment_status_changed: Package,
  order_cancelled: XCircle,
  order_archived: CheckCircle,
  payment_voided: XCircle,
};

const eventLabels: Record<string, string> = {
  imported_from_shopsite: 'Imported from ShopSite',
  imported_from_integra: 'Imported from Integra Register',
  status_changed: 'Status Changed',
  payment_status_changed: 'Payment Updated',
  fulfillment_status_changed: 'Fulfillment Updated',
  order_cancelled: 'Order Cancelled',
  order_archived: 'Order Archived',
  payment_voided: 'Payment Voided',
};

function formatRelative(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function OrderTimeline({ events }: { events: OrderEvent[] }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No events recorded</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((event, idx) => {
        const Icon = eventIcons[event.event_type] ?? Info;
        const label = eventLabels[event.event_type] ?? event.event_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        return (
          <div key={event.id} className="flex gap-3 pb-4 relative">
            {/* Timeline line */}
            {idx < events.length - 1 && (
              <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
            )}
            {/* Icon */}
            <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-3 w-3 text-muted-foreground" />
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{label}</p>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(event.created_at)}
                </span>
              </div>
              {event.note && (
                <p className="text-xs text-muted-foreground mt-0.5">{event.note}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
