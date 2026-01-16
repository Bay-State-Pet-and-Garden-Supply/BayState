'use client';

import Link from 'next/link';
import { Eye, Clock, Package, CheckCircle, XCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/admin/data-table';
import { type Order } from '@/lib/orders';

interface OrdersDataTableProps {
  orders: Order[];
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: Package },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: XCircle },
};

export function OrdersDataTable({ orders }: OrdersDataTableProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

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
      ...orders.map((o) => [
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
        return (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
            <status.icon className="h-3 w-3" />
            {status.label}
          </span>
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
    <Button variant="outline" size="sm" asChild>
      <Link href={`/admin/orders/${order.id}`}>
        <Eye className="mr-1 h-4 w-4" />
        View
      </Link>
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <DataTable
        data={orders}
        columns={columns}
        searchPlaceholder="Search orders by number or customer..."
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
        actions={renderActions}
        emptyMessage="No orders yet"
      />
    </div>
  );
}
