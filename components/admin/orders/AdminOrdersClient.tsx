'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Clock, Package, CheckCircle, XCircle, Download, ShoppingBag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/admin/data-table';
import { type Order } from '@/lib/orders';
import { OrderModal } from './OrderModal';
import { toast } from 'sonner';
import { deleteOrder } from '@/app/admin/orders/actions';
import { formatCurrency } from '@/lib/utils';

interface AdminOrdersClientProps {
    initialOrders: Order[];
    totalCount: number;
}

const statusConfig = {
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: Package },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: XCircle },
};

export function AdminOrdersClient({ initialOrders, totalCount }: AdminOrdersClientProps) {
    const router = useRouter();
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const handleUpdate = () => {
        router.refresh();
        // In a real generic modal, we might want to refetch the specific order to update the modal content without closing it,
        // but Next.js router.refresh() updates the server components, so initialOrders will update.
        // However, selectedOrder state won't automatically update unless we sync it. 
        // Ideally we should close the modal or fetch the fresh order.
        // For now, let's close the modal on significant status changes or just accept that the list updates behind it.
    };

    const handleCloseModal = () => {
        setSelectedOrder(null);
    };

    const handleDelete = async (order: Order) => {
        if (!confirm(`Are you sure you want to delete order ${order.order_number}? This action cannot be undone.`)) return;

        setDeleting(order.id);
        try {
            const res = await deleteOrder(order.id);
            if (!res.success) throw new Error(res.error);
            toast.success('Order deleted');
            router.refresh();
        } catch {
            toast.error('Failed to delete order');
        } finally {
            setDeleting(null);
        }
    }

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
            ['Order Number', 'Customer', 'Email', 'Status', 'Total', 'Date'],
            ...initialOrders.map((o) => [
                o.order_number,
                o.customer_name,
                o.customer_email,
                o.status,
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


    const columns: Column<Order>[] = [
        {
            key: 'order_number',
            header: 'Order',
            sortable: true,
            searchable: true,
            render: (_, row) => (
                <span className="font-mono font-medium text-gray-900">{row.order_number}</span>
            ),
        },
        {
            key: 'customer_name',
            header: 'Customer',
            sortable: true,
            searchable: true,
            render: (_, row) => (
                <div>
                    <p className="font-medium text-gray-900">{row.customer_name}</p>
                    <p className="text-xs text-gray-600">{row.customer_email}</p>
                </div>
            ),
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
                    <p className="text-gray-900">{formatDate(String(value))}</p>
                    <p className="text-xs text-gray-600">{formatTime(String(value))}</p>
                </div>
            ),
        },
    ];

    const renderActions = (order: Order) => (
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
                <Eye className="mr-1 h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(order)}
                disabled={deleting === order.id}
                className="text-red-600 hover:bg-red-50"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
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
                    order={selectedOrder}
                    onClose={handleCloseModal}
                    onUpdate={handleUpdate}
                />
            )}
        </div>
    );
}
