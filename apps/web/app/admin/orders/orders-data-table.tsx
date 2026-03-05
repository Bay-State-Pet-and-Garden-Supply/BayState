'use client';

import Link from 'next/link';
import { Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/admin/data-table';
import { type Order } from '@/lib/orders';
import { StatusBadge } from '@/components/ui/status-badge';

interface OrdersDataTableProps {
  orders: Order[];
}

import { formatDate, formatCurrency } from '@/lib/utils';

export function OrdersDataTable({ orders }: OrdersDataTableProps) {
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
      render: (value) => (
        <StatusBadge status={String(value)} className="font-normal" />
      ),
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
