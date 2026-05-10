'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, Clock, Package, CheckCircle, XCircle, Download, ShoppingBag, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/admin/data-table';
import { type Order } from '@/lib/orders';
import { type AdminOrderListRow } from '@/lib/admin/orders/types';
import { OrderModal } from './OrderModal';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { ConfirmationDialog } from '@/components/admin/confirmation-dialog';

interface AdminOrdersClientProps {
    initialOrders: AdminOrderListRow[];
    totalCount: number;
    initialQ?: string;
    initialSource?: string;
    initialPaymentStatus?: string;
    initialFulfillmentStatus?: string;
    initialFulfillmentMethod?: string;
    initialDateFrom?: string;
    initialDateTo?: string;
}

const statusConfig = {
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: Package },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: XCircle },
};

const sourceBadgeConfig: Record<string, { label: string; color: string }> = {
    web: { label: 'Web', color: 'bg-green-100 text-green-800' },
    shopsite: { label: 'Legacy', color: 'bg-amber-100 text-amber-800' },
    integra: { label: 'Register', color: 'bg-blue-100 text-blue-800' },
    manual: { label: 'Manual', color: 'bg-gray-100 text-gray-800' },
};

const paymentBadgeConfig: Record<string, { label: string; color: string }> = {
    unpaid: { label: 'Unpaid', color: 'bg-muted text-foreground' },
    authorized: { label: 'Authorized', color: 'bg-blue-100 text-blue-800' },
    paid: { label: 'Paid', color: 'bg-green-100 text-green-800' },
    failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
    refunded: { label: 'Refunded', color: 'bg-purple-100 text-purple-800' },
    partially_refunded: { label: 'Partially Refunded', color: 'bg-orange-100 text-orange-800' },
    voided: { label: 'Voided', color: 'bg-gray-100 text-gray-800' },
};

const fulfillmentBadgeConfig: Record<string, { label: string; color: string }> = {
    unfulfilled: { label: 'Unfulfilled', color: 'bg-gray-100 text-gray-800' },
    reserved: { label: 'Reserved', color: 'bg-blue-100 text-blue-800' },
    ready_for_pickup: { label: 'Ready for Pickup', color: 'bg-green-100 text-green-800' },
    out_for_delivery: { label: 'Out for Delivery', color: 'bg-indigo-100 text-indigo-800' },
    fulfilled: { label: 'Fulfilled', color: 'bg-green-700 text-white' },
    partially_fulfilled: { label: 'Partially Fulfilled', color: 'bg-yellow-100 text-yellow-800' },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

const filterOptions = {
    source: [
        { value: '', label: 'All Sources' },
        { value: 'web', label: 'Web' },
        { value: 'shopsite', label: 'Legacy' },
        { value: 'integra', label: 'Register' },
        { value: 'manual', label: 'Manual' },
    ],
    status: [
        { value: '', label: 'All Statuses' },
        { value: 'pending', label: 'Pending' },
        { value: 'processing', label: 'Processing' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' },
    ],
    paymentStatus: [
        { value: '', label: 'All Payments' },
        { value: 'unpaid', label: 'Unpaid' },
        { value: 'authorized', label: 'Authorized' },
        { value: 'paid', label: 'Paid' },
        { value: 'failed', label: 'Failed' },
        { value: 'refunded', label: 'Refunded' },
        { value: 'partially_refunded', label: 'Partially Refunded' },
        { value: 'voided', label: 'Voided' },
    ],
    fulfillmentStatus: [
        { value: '', label: 'All Fulfillment' },
        { value: 'unfulfilled', label: 'Unfulfilled' },
        { value: 'reserved', label: 'Reserved' },
        { value: 'ready_for_pickup', label: 'Ready for Pickup' },
        { value: 'out_for_delivery', label: 'Out for Delivery' },
        { value: 'fulfilled', label: 'Fulfilled' },
        { value: 'partially_fulfilled', label: 'Partially Fulfilled' },
        { value: 'cancelled', label: 'Cancelled' },
    ],
    fulfillmentMethod: [
        { value: '', label: 'All Methods' },
        { value: 'pickup', label: 'Pickup' },
        { value: 'delivery', label: 'Delivery' },
    ],
};

function FilterSelect({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <select
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    );
}

export function AdminOrdersClient({ initialOrders, totalCount, initialQ, initialSource, initialPaymentStatus, initialFulfillmentStatus, initialFulfillmentMethod, initialDateFrom, initialDateTo }: AdminOrdersClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedOrder, setSelectedOrder] = useState<AdminOrderListRow | null>(null);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [pendingCancelOrder, setPendingCancelOrder] = useState<AdminOrderListRow | null>(null);
    const [cancelling, setCancelling] = useState<string | null>(null);
    const [searchText, setSearchText] = useState(initialQ ?? '');

    const buildUrl = useCallback((updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(updates)) {
            if (value && value !== '') {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        }
        return `/admin/orders?${params.toString()}`;
    }, [searchParams]);

    const handleFilterChange = (key: string, value: string) => {
        router.push(buildUrl({ [key]: value || undefined }));
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(buildUrl({ q: searchText || undefined }));
    };

    const handleUpdate = () => {
        router.refresh();
    };

    const handleCloseModal = () => {
        setSelectedOrder(null);
    };

    const handleCancelClick = (order: AdminOrderListRow) => {
        setPendingCancelOrder(order);
        setCancelOpen(true);
    };

    const handleConfirmCancel = async () => {
        if (!pendingCancelOrder) return;
        setCancelOpen(false);

        const order = pendingCancelOrder;
        setCancelling(order.id);
        try {
            const { cancelOrderAction } = await import('@/app/admin/orders/actions');
            const res = await cancelOrderAction(order.id);
            if (!res.success) throw new Error(res.error);
            toast.success('Order cancelled');
            router.refresh();
        } catch {
            toast.error('Failed to cancel order');
        } finally {
            setCancelling(null);
        }
        setPendingCancelOrder(null);
    };

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });

    const formatTime = (dateString: string) =>
        new Date(dateString).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });

    const handleExport = () => {
        const rows = [
            ['Order Number', 'Source', 'Customer', 'Email', 'Status', 'Payment', 'Fulfillment', 'Total', 'Date'],
            ...initialOrders.map((o) => [
                o.order_number,
                o.source_type ?? '',
                o.customer_name,
                o.customer_email,
                o.status,
                o.payment_status ?? '',
                o.fulfillment_status ?? '',
                o.total.toFixed(2),
                new Date(o.created_at).toISOString(),
            ]),
        ];

        const csvContent = rows.map((row) => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const columns: Column<AdminOrderListRow>[] = [
        {
            key: 'order_number',
            header: 'Order',
            sortable: true,
            searchable: true,
            render: (_, row) => (
                <span className="font-mono font-medium text-foreground">{row.order_number}</span>
            ),
        },
        {
            key: 'source_type',
            header: 'Source',
            render: (value) => {
                const cfg = sourceBadgeConfig[value as string] ?? { label: String(value), color: 'bg-gray-100 text-gray-800' };
                return <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>;
            },
        },
        {
            key: 'customer_name',
            header: 'Customer',
            sortable: true,
            searchable: true,
            render: (_, row) => (
                <div>
                    <p className="font-medium text-foreground">{row.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{row.customer_email}</p>
                </div>
            ),
        },
        {
            key: 'payment_status',
            header: 'Payment',
            render: (value) => {
                const cfg = paymentBadgeConfig[value as string] ?? { label: String(value), color: 'bg-gray-100 text-gray-800' };
                return <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>;
            },
        },
        {
            key: 'fulfillment_status',
            header: 'Fulfillment',
            render: (value) => {
                const cfg = fulfillmentBadgeConfig[value as string] ?? { label: String(value), color: 'bg-gray-100 text-gray-800' };
                return <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>;
            },
        },
        {
            key: 'status',
            header: 'Status',
            sortable: true,
            render: (value) => {
                const status = statusConfig[value as keyof typeof statusConfig];
                if (!status) return String(value);

                let badgeVariant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" = "outline";

                if (value === 'completed') badgeVariant = "success";
                else if (value === 'cancelled') badgeVariant = "destructive";
                else if (value === 'processing') badgeVariant = "default";
                else if (value === 'pending') badgeVariant = "warning";

                return (
                    <Badge variant={badgeVariant} className={`gap-1 ${value === 'processing' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-none' : ''}`}>
                        <status.icon className="h-3 w-3" />
                        {status.label}
                    </Badge>
                );
            },
        },
        {
            key: 'total',
            header: 'Total',
            sortable: true,
            render: (value) => (
                <span className="font-semibold text-green-600">
                    {formatCurrency(Number(value))}
                </span>
            ),
        },
        {
            key: 'created_at',
            header: 'Date',
            sortable: true,
            render: (value) => (
                <div className="text-sm">
                    <p className="text-foreground">{formatDate(String(value))}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(String(value))}</p>
                </div>
            ),
        },
    ];

    const renderActions = (order: AdminOrderListRow) => (
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
                <Eye className="mr-1 h-4 w-4" />
            </Button>
            {(order.status === 'pending' || order.status === 'processing') && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelClick(order)}
                    disabled={cancelling === order.id}
                    className="text-red-600 hover:bg-red-50"
                >
                    <XCircle className="h-4 w-4" />
                </Button>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ShoppingBag className="h-8 w-8 text-blue-600" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
                        <p className="text-muted-foreground">{totalCount} orders</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                </Button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <form onSubmit={handleSearch} className="relative">
                    <input
                        type="text"
                        placeholder="Search orders..."
                        className="h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                    {searchText && (
                        <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                setSearchText('');
                                router.push(buildUrl({ q: undefined }));
                            }}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </form>
                <FilterSelect
                    label="Source"
                    options={filterOptions.source}
                    value={searchParams.get('source') ?? initialSource ?? ''}
                    onChange={(v) => handleFilterChange('source', v)}
                />
                <FilterSelect
                    label="Status"
                    options={filterOptions.status}
                    value={searchParams.get('status') ?? ''}
                    onChange={(v) => handleFilterChange('status', v)}
                />
                <FilterSelect
                    label="Payment"
                    options={filterOptions.paymentStatus}
                    value={searchParams.get('payment_status') ?? initialPaymentStatus ?? ''}
                    onChange={(v) => handleFilterChange('payment_status', v)}
                />
                <FilterSelect
                    label="Fulfillment"
                    options={filterOptions.fulfillmentStatus}
                    value={searchParams.get('fulfillment_status') ?? initialFulfillmentStatus ?? ''}
                    onChange={(v) => handleFilterChange('fulfillment_status', v)}
                />
                <FilterSelect
                    label="Fulfillment Method"
                    options={filterOptions.fulfillmentMethod}
                    value={searchParams.get('fulfillment_method') ?? initialFulfillmentMethod ?? ''}
                    onChange={(v) => handleFilterChange('fulfillment_method', v)}
                />
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={searchParams.get('date_from') ?? initialDateFrom ?? ''}
                        onChange={(e) => handleFilterChange('date_from', e.target.value)}
                        aria-label="Date from"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                        type="date"
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={searchParams.get('date_to') ?? initialDateTo ?? ''}
                        onChange={(e) => handleFilterChange('date_to', e.target.value)}
                        aria-label="Date to"
                    />
                </div>
            </div>

            <DataTable
                data={initialOrders}
                columns={columns}
                searchPlaceholder="Search orders by number or customer..."
                pageSize={20}
                pageSizeOptions={[10, 20, 50, 100]}
                actions={renderActions}
                emptyMessage="No orders yet"
            />

            {selectedOrder && (
                <OrderModal
                    order={selectedOrder as unknown as Order}
                    onClose={handleCloseModal}
                    onUpdate={handleUpdate}
                />
            )}

            <ConfirmationDialog
                open={cancelOpen}
                onOpenChange={(open) => {
                    setCancelOpen(open);
                    if (!open) setPendingCancelOrder(null);
                }}
                onConfirm={handleConfirmCancel}
                title="Cancel Order"
                description={`Are you sure you want to cancel order ${pendingCancelOrder?.order_number}? The order status will be set to cancelled.`}
                confirmLabel="Cancel Order"
                variant="destructive"
                isLoading={!!cancelling}
            />
        </div>
    );
}
