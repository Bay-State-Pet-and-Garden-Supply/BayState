'use client';

import Link from 'next/link';
import { Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/admin/data-table';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  unit: string | null;
  is_active: boolean;
  created_at: string;
}

interface ServicesDataTableProps {
  services: Service[];
}

export function ServicesDataTable({ services }: ServicesDataTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Service[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);

  const handleToggleStatus = async (service: Service) => {
    setUpdating(service.id);
    try {
      const response = await fetch(`/api/admin/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !service.is_active }),
      });

      if (!response.ok) {
        throw new Error('Failed to update service');
      }

      toast.success(
        `${service.name} is now ${!service.is_active ? 'active' : 'inactive'}`
      );
      router.refresh();
    } catch (error) {
      toast.error('Failed to update service');
      console.error(error);
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (service: Service) => {
    if (!confirm(`Are you sure you want to delete "${service.name}"?`)) {
      return;
    }

    setUpdating(service.id);
    try {
      const response = await fetch(`/api/admin/services/${service.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete service');
      }

      toast.success(`Deleted "${service.name}"`);
      router.refresh();
    } catch (error) {
      toast.error('Failed to delete service');
      console.error(error);
    } finally {
      setUpdating(null);
    }
  };

  const handleBulkToggle = async (activate: boolean) => {
    if (selected.length === 0) return;

    let successCount = 0;
    for (const service of selected) {
      try {
        const response = await fetch(`/api/admin/services/${service.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: activate }),
        });
        if (response.ok) successCount++;
      } catch {
        // Continue
      }
    }

    toast.success(`Updated ${successCount} service(s)`);
    setSelected([]);
    router.refresh();
  };

  const formatPrice = (price: number | null, unit: string | null) => {
    if (price === null) return 'Contact';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
    return unit ? `${formatted}/${unit}` : formatted;
  };

  const columns: Column<Service>[] = [
    {
      key: 'name',
      header: 'Service',
      sortable: true,
      searchable: true,
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          {row.description && (
            <p className="text-xs text-gray-600 line-clamp-1">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      render: (_, row) => (
        <span className="font-semibold text-green-600">
          {formatPrice(row.price, row.unit)}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (value) => (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      sortable: true,
      searchable: true,
      render: (value) => (
        <code className="rounded bg-gray-100 px-2 py-0.5 text-xs">{String(value)}</code>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">
          {new Date(String(value)).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: '2-digit',
          })}
        </span>
      ),
    },
  ];

  const renderActions = (service: Service) => (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleToggleStatus(service)}
        disabled={updating === service.id}
        title={service.is_active ? 'Deactivate' : 'Activate'}
      >
        {service.is_active ? (
          <ToggleRight className="h-4 w-4 text-green-600" />
        ) : (
          <ToggleLeft className="h-4 w-4 text-gray-400" />
        )}
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/admin/services/${service.id}/edit`}>
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleDelete(service)}
        disabled={updating === service.id}
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-purple-50 px-4 py-2">
          <span className="text-sm text-purple-700">
            {selected.length} service(s) selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkToggle(true)}
            >
              <ToggleRight className="mr-1 h-4 w-4" />
              Activate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkToggle(false)}
            >
              <ToggleLeft className="mr-1 h-4 w-4" />
              Deactivate
            </Button>
          </div>
        </div>
      )}
      <DataTable
        data={services}
        columns={columns}
        searchPlaceholder="Search services..."
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
        selectable
        onSelectionChange={setSelected}
        actions={renderActions}
        emptyMessage="No services found."
        emptyAction={
          <Button asChild>
            <Link href="/admin/services/new">Add Service</Link>
          </Button>
        }
      />
    </div>
  );
}
