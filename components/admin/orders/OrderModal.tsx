'use client';

import { useEffect, useCallback, useState } from 'react';
import { X, Package, Clock, CheckCircle, XCircle, User, Mail, Phone, FileText, CreditCard, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type Order } from '@/lib/orders';
import { updateOrderStatusAction } from '@/app/admin/orders/actions';
import { toast } from 'sonner';

interface OrderModalProps {
    order: Order;
    onClose: () => void;
    onUpdate: () => void;
}

const statusConfig = {
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: Package },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: XCircle },
};

const paymentStatusConfig = {
    pending: { label: 'Pending', color: 'bg-zinc-100 text-zinc-800' },
    processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800' },
    completed: { label: 'Paid', color: 'bg-green-100 text-green-800' },
    failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
    refunded: { label: 'Refunded', color: 'bg-purple-100 text-purple-800' },
    partially_refunded: { label: 'Partially Refunded', color: 'bg-orange-100 text-orange-800' },
};

const paymentMethodLabels: Record<string, string> = {
    pickup: 'Pay at Pickup',
    credit_card: 'Credit Card',
    paypal: 'PayPal',
};

const nextStatuses = {
    pending: ['processing', 'cancelled'],
    processing: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
};

export function OrderModal({
    order,
    onClose,
    onUpdate
}: OrderModalProps) {
    const [updating, setUpdating] = useState(false);

    const status = statusConfig[order.status];
    const StatusIcon = status.icon;

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        },
        [onClose]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleStatusUpdate = async (newStatus: 'processing' | 'completed' | 'cancelled') => {
        if (!confirm(`Are you sure you want to change status to ${newStatus}?`)) return;

        setUpdating(true);
        try {
            const result = await updateOrderStatusAction(order.id, newStatus);
            if (!result.success) throw new Error(result.error);

            toast.success(`Order marked as ${newStatus}`);
            onUpdate();
            // We can keep the modal open to show the new status, but props need to update. 
            // Since parent refreshes, this component should re-render with new order object if parent passes it.
            // However, simpler to just close or rely on parent re-render.
        } catch (err) {
            toast.error('Failed to update status');
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl flex flex-col">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold tracking-tight">{order.order_number}</h2>
                        <Badge className={status.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {status.label}
                        </Badge>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 hover:bg-gray-100"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                    {/* Status Actions */}
                    {nextStatuses[order.status].length > 0 && (
                        <div className="flex gap-2 justify-end">
                            {nextStatuses[order.status].map((nextStatus) => {
                                const config = statusConfig[nextStatus as keyof typeof statusConfig];
                                return (
                                    <Button
                                        key={nextStatus}
                                        onClick={() => handleStatusUpdate(nextStatus as 'processing' | 'completed' | 'cancelled')}
                                        variant={nextStatus === 'cancelled' ? 'destructive' : 'default'}
                                        size="sm"
                                        disabled={updating}
                                    >
                                        Mark as {config.label}
                                    </Button>
                                );
                            })}
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
                                                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100">
                                                        <Package className="h-6 w-6 text-zinc-500" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-zinc-900">{item.item_name}</p>
                                                        <p className="text-sm text-zinc-600">
                                                            {item.item_type === 'service' ? 'Service' : 'Product'} •{' '}
                                                            {formatCurrency(item.unit_price)} × {item.quantity}
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="font-semibold text-zinc-900">
                                                    {formatCurrency(item.total_price)}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>

                                    {/* Totals */}
                                    <div className="mt-4 space-y-2 border-t pt-4">
                                        <div className="flex justify-between">
                                            <span className="text-zinc-600">Subtotal</span>
                                            <span className="font-medium">{formatCurrency(order.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-600">Tax</span>
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

                        {/* Payment Info */}
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <CreditCard className="h-5 w-5" />
                                        Payment
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-zinc-600">Method</span>
                                        <span className="font-medium">
                                            {paymentMethodLabels[order.payment_method] || order.payment_method}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-zinc-600">Status</span>
                                        <Badge className={paymentStatusConfig[order.payment_status as keyof typeof paymentStatusConfig]?.color}>
                                            {paymentStatusConfig[order.payment_status as keyof typeof paymentStatusConfig]?.label || order.payment_status}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-zinc-600">Total</span>
                                        <span className="font-medium">{formatCurrency(order.total)}</span>
                                    </div>
                                    {order.refunded_amount && order.refunded_amount > 0 && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-zinc-600">Refunded</span>
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
                                            <p className="text-xs font-mono text-zinc-500 truncate">
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
                                        <User className="h-5 w-5 text-zinc-500" />
                                        <span className="font-medium">{order.customer_name}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Mail className="h-5 w-5 text-zinc-500" />
                                        <a
                                            href={`mailto:${order.customer_email}`}
                                            className="text-blue-600 hover:underline break-all"
                                        >
                                            {order.customer_email}
                                        </a>
                                    </div>
                                    {order.customer_phone && (
                                        <div className="flex items-center gap-3">
                                            <Phone className="h-5 w-5 text-zinc-500" />
                                            <a
                                                href={`tel:${order.customer_phone}`}
                                                className="text-blue-600 hover:underline"
                                            >
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

                            {order.notes && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Notes</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-start gap-3">
                                            <FileText className="mt-0.5 h-5 w-5 text-zinc-500" />
                                            <p className="text-zinc-600">{order.notes}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 flex items-center justify-end border-t bg-gray-50 px-6 py-4">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
