import type { Metadata } from 'next';
import { ClipboardList, MapPinned, Store } from 'lucide-react';
import { AdminControlBar } from '@/components/admin/admin-control-bar';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Orders | Bay State Admin',
  description: 'Future queue for pickup and local delivery fulfillment.',
};

export default function OrdersPage() {
  return (
    <AdminPageShell
      title="Orders"
      description="This is the future queue for pickup and local delivery work. The shell is ready, and the data contract can plug into it next."
      icon={<ClipboardList className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <div className="flex flex-col gap-5 pb-6">
        <div className="grid gap-4 md:grid-cols-3">
          <AdminStatCard label="Ready for pickup" value={0} hint="Orders staged for in-store handoff." icon={<Store className="h-5 w-5" />} />
          <AdminStatCard label="Out for local delivery" value={0} hint="Delivery orders actively assigned or on route." icon={<MapPinned className="h-5 w-5" />} />
          <AdminStatCard label="Exceptions" value={0} hint="Orders blocked by payment, stock, or handoff issues." />
        </div>

        <AdminControlBar>
          <p className="text-sm leading-6 text-muted-foreground">
            This route is intentionally honest: it shows the queue shell we will use for pickup and local delivery once order data is connected. The design language is ready now, without pretending the workflow is wired before the backend exists.
          </p>
        </AdminControlBar>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <AdminEmptyState
            icon={ClipboardList}
            title="No order data is connected yet."
            description="When the fulfillment data contract is ready, this queue will become the staff workbench for pickup orders, local delivery handoff, and exception handling."
          />

          <Card>
            <CardHeader>
              <CardTitle>Planned workflow</CardTitle>
              <CardDescription>How this queue will fit the admin system once order data is connected.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="font-medium text-foreground">Pickup</p>
                <p className="mt-1">Staff see what is ready, stage it, and mark it complete without losing the order context.</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="font-medium text-foreground">Local delivery</p>
                <p className="mt-1">Orders can move from packing to route-ready with visible exceptions and notes.</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="font-medium text-foreground">Exception handling</p>
                <p className="mt-1">Blocked orders should sit beside pipeline and quality work, not in a separate mini-app.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminPageShell>
  );
}
