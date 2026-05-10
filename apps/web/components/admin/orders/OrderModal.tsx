'use client';

import { useEffect, useCallback, useState, use } from 'react';
import { Package, User, Mail, Phone, FileText, CreditCard, Truck, MapPin, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type Order, type OrderFulfillmentStatus } from '@/lib/orders';
import { updateOrderStatusAction, cancelOrderAction } from '@/app/admin/orders/actions';
import { updateOrderFulfillmentStatusAction } from '@/app/admin/orders/actions';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCurrency } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmationDialog } from '@/components/admin/confirmation-dialog';

interface OrderModalProps {
  order: Order;
  onClose: () => void;
  onUpdate: () => void;
}

const paymentStatusConfig: Record<string, { label: string; color: string }> = {
  unpaid: { label: 'Unpaid', color: 'bg-muted text-foreground' },
  authorized: { label: 'Authorized', color: 'bg-blue-100 text-blue-800' },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
  refunded: { label: 'Refunded', color: 'bg-purple-100 text-purple-800' },
  partially_refunded: { label: 'Partial Refund', color: 'bg-orange-100 text-orange-800' },
  voided: { label: 'Voided', color: 'bg-gray-100 text-gray-800' },
};

const fulfillmentStatusConfig: Record<string, { label: string; color: string }> = {
  unfulfilled: { label: 'Unfulfilled', color: 'bg-muted text-foreground' },
  reserved: { label: 'Reserved', color: 'bg-blue-100 text-blue-800' },
  ready_for_pickup: { label: 'Ready for Pickup', color: 'bg-green-100 text-green-800' },
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-blue-100 text-blue-800' },
  fulfilled: { label: 'Fulfilled', color: 'bg-green-100 text-green-800' },
  partially_fulfilled: { label: 'Partial Fulfill', color: 'bg-orange-100 text-orange-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

const sourceLabels: Record<string, string> = {
  web: 'Web',
  shopsite: 'ShopSite Legacy',
  integra: 'Register (Integra)',
  manual: 'Manual',
  import: 'Import',
};

const paymentMethodLabels: Record<string, string> = {
  pickup: 'Pay at Pickup',
  credit_card: 'Credit Card',
  paypal: 'PayPal',
  in_store: 'In-Store Register',
};

const nextStatuses: Record<string, string[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function OrderModal({
  order,
  onClose,
  onUpdate,
}: OrderModalProps) {
  const [updating, setUpdating] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [fulfillmentStatus, setFulfillmentStatus] = useState<OrderFulfillmentStatus | null>(null);
  const [showFulfillmentUpdate, setShowFulfillmentUpdate] = useState(false);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleStatusUpdate = async (newStatus: 'processing' | 'completed' | 'cancelled') => {
    setUpdating(true);
    try {
      const result = await updateOrderStatusAction(order.id, newStatus);
      if (!result.success) throw new Error(result.error);
      toast.success(`Order marked as ${newStatus}`);
      onUpdate();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleFulfillmentUpdate = async () => {
    if (!fulfillmentStatus) return;
    setUpdating(true);
    try {
      const result = await updateOrderFulfillmentStatusAction(order.id, fulfillmentStatus);
      if (!result.success) throw new Error(result.error);
      toast.success(`Fulfillment updated to ${fulfillmentStatusConfig[fulfillmentStatus]?.label ?? fulfillmentStatus}`);
      setShowFulfillmentUpdate(false);
      setFulfillmentStatus(null);
      onUpdate();
    } catch {
      toast.error('Failed to update fulfillment status');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = async () => {
    setUpdating(true);
    try {
      const result = await cancelOrderAction(order.id);
      if (!result.success) throw new Error(result.error);
      toast.success('Order cancelled');
      setConfirmCancelOpen(false);
      onUpdate();
      onClose();
    } catch {
      toast.error('Failed to cancel order');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 flex-wrap">
              <DialogTitle className="text-xl font-bold tracking-tight">{order.order_number}</DialogTitle>
              <StatusBadge status={order.status} />
              {order.source_type && (
                <Badge variant="outline" className="text-xs">
                  {sourceLabels[order.source_type] ?? order.source_type}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 py-4 space-y-6 overflow-y-auto">
            {/* Status & Fulfillment Actions */}
            <div className="flex gap-2 justify-end flex-wrap">
              {nextStatuses[order.status]?.length > 0 && (
                <>
                  {nextStatuses[order.status].map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      onClick={() =>
                        nextStatus === 'cancelled'
                          ? setConfirmCancelOpen(true)
                          : handleStatusUpdate(nextStatus as 'processing' | 'completed')
                      }
                      variant={nextStatus === 'cancelled' ? 'destructive' : 'default'}
                      size="sm"
                      disabled={updating}
                      className="capitalize"
                    >
                      Mark {nextStatus}
                    </Button>
                  ))}
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFulfillmentStatus(order.fulfillment_status);
                  setShowFulfillmentUpdate(!showFulfillmentUpdate);
                }}
              >
                Update Fulfillment
              </Button>
            </div>

            {/* Inline fulfillment update */}
            {showFulfillmentUpdate && (
              <div className="flex items-center gap-2 bg-muted/30 p-3 rounded-lg">
                <Select value={fulfillmentStatus ?? ''} onValueChange={(v) => setFulfillmentStatus(v as OrderFulfillmentStatus)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unfulfilled">Unfulfilled</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="ready_for_pickup">Ready for Pickup</SelectItem>
                    <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    <SelectItem value="partially_fulfilled">Partially Fulfilled</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleFulfillmentUpdate} disabled={updating || !fulfillmentStatus}>
                  Apply
                </Button>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Order Items */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Order Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y">
                      {order.items?.map((item) => (
                        <li key={item.id} className="flex items-center justify-between py-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{item.item_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.item_type === 'service' ? 'Service' : 'Product'} •{' '}
                                {formatCurrency(item.unit_price)} × {item.quantity}
                              </p>
                            </div>
                          </div>
                          <p className="font-semibold text-foreground">
                            {formatCurrency(item.total_price)}
                          </p>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 space-y-2 border-t pt-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">{formatCurrency(order.subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tax</span>
                        <span className="font-medium">{formatCurrency(order.tax)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                        <span>Total</span>
                        <span>{formatCurrency(order.total)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Payment Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Payment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Method</span>
                      <span className="font-medium">
                        {paymentMethodLabels[order.payment_method] || order.payment_method}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge className={paymentStatusConfig[order.payment_status]?.color}>
                        {paymentStatusConfig[order.payment_status]?.label || order.payment_status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="font-medium">{formatCurrency(order.total)}</span>
                    </div>
                    {order.refunded_amount != null && order.refunded_amount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Refunded</span>
                        <span className="font-medium text-red-600">
                          -{formatCurrency(order.refunded_amount)}
                        </span>
                      </div>
                    )}
                    {order.paid_at && (
                      <div className="pt-4 border-t">
                        <p className="text-sm text-muted-foreground">Paid on</p>
                        <p className="text-sm font-medium">{formatDate(order.paid_at)}</p>
                      </div>
                    )}
                    {order.stripe_payment_intent_id && (
                      <div className="pt-4 border-t">
                        <p className="text-xs text-muted-foreground">Stripe ID</p>
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {order.stripe_payment_intent_id}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Customer Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Customer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">{order.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <a href={`mailto:${order.customer_email}`} className="text-blue-600 hover:underline break-all">
                        {order.customer_email}
                      </a>
                    </div>
                    {order.customer_phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <a href={`tel:${order.customer_phone}`} className="text-blue-600 hover:underline">
                          {order.customer_phone}
                        </a>
                      </div>
                    )}
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">Placed on</p>
                      <p className="text-sm font-medium">{formatDate(order.created_at)}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Fulfillment Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {order.fulfillment_method === 'delivery' ? (
                        <Truck className="h-5 w-5" />
                      ) : (
                        <MapPin className="h-5 w-5" />
                      )}
                      {order.fulfillment_method === 'delivery' ? 'Delivery' : 'Pickup'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Fulfillment Status</span>
                      <Badge className={fulfillmentStatusConfig[order.fulfillment_status]?.color}>
                        {fulfillmentStatusConfig[order.fulfillment_status]?.label ?? order.fulfillment_status}
                      </Badge>
                    </div>
                    {order.fulfillment_method === 'delivery' ? (
                      <>
                        {order.delivery_distance_miles != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Distance</span>
                            <span className="font-medium">
                              {order.delivery_distance_miles.toFixed(1)} miles
                            </span>
                          </div>
                        )}
                        {order.delivery_fee > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Delivery Fee</span>
                            <span className="font-medium">{formatCurrency(order.delivery_fee)}</span>
                          </div>
                        )}
                        {order.delivery_services && order.delivery_services.length > 0 && (
                          <div className="pt-4 border-t">
                            <p className="text-sm text-muted-foreground mb-2">Delivery Services</p>
                            {order.delivery_services.map((service) => (
                              <div key={service.service} className="flex items-center justify-between text-sm">
                                <span className="capitalize">
                                  {service.service.replace(/_/g, ' ')}
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(service.fee)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {order.delivery_notes && (
                          <div className="pt-4 border-t">
                            <p className="text-sm text-muted-foreground mb-1">Delivery Notes</p>
                            <p className="text-sm">{order.delivery_notes}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <MapPin className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Store Pickup</p>
                            <p className="text-sm text-muted-foreground">
                              429 Winthrop Street, Taunton, MA 02780
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          Customer will pick up at the store
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Source Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Source
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Type</span>
                      <Badge variant="outline">
                        {sourceLabels[order.source_type] ?? order.source_type ?? '—'}
                      </Badge>
                    </div>
                    {order.source_system && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">System</span>
                        <span className="text-sm font-mono">{order.source_system}</span>
                      </div>
                    )}
                    {order.external_order_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">External ID</span>
                        <span className="text-sm font-mono">{order.external_order_id}</span>
                      </div>
                    )}
                    {order.external_created_at && (
                      <div className="pt-4 border-t">
                        <p className="text-sm text-muted-foreground">External Created</p>
                        <p className="text-sm">{formatDate(order.external_created_at)}</p>
                      </div>
                    )}
                    {order.imported_at && (
                      <div>
                        <p className="text-sm text-muted-foreground">Imported</p>
                        <p className="text-sm">{formatDate(order.imported_at)}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {order.notes && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <p className="text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        onConfirm={handleCancel}
        title="Cancel Order"
        description="Are you sure you want to cancel this order? It will be marked as cancelled."
        confirmLabel="Cancel Order"
        variant="destructive"
        isLoading={updating}
      />
    </>
  );
}
