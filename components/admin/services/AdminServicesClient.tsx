'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Plus, Wrench, ToggleRight, ToggleLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/admin/data-table';
import { toast } from 'sonner';
import { deleteService, toggleServiceStatus } from '@/app/admin/services/actions';
import { ServiceModal, Service } from './ServiceModal';

interface AdminServicesClientProps {
    initialServices: Service[];
    totalCount: number;
}

export function AdminServicesClient({ initialServices, totalCount }: AdminServicesClientProps) {
    const router = useRouter();
    const [selected, setSelected] = useState<Service[]>([]);
    const [updating, setUpdating] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<Service | undefined>(undefined);

    const handleToggleStatus = async (service: Service) => {
        setUpdating(service.id);
        try {
            const result = await toggleServiceStatus(service.id, !service.is_active);
            if (!result.success) {
                throw new Error(result.error);
            }
            toast.success(
                `${service.name} is now ${!service.is_active ? 'active' : 'inactive'}`
            );
            router.refresh();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to update service';
            toast.error(msg);
        } finally {
            setUpdating(null);
        }
    };

    const handleBulkToggle = async (activate: boolean) => {
        if (selected.length === 0) return;

        // Concurrency again
        let successCount = 0;
        for (const service of selected) {
            // Skip if already in desired state?
            if (service.is_active === activate) continue;

            const result = await toggleServiceStatus(service.id, activate);
            if (result.success) successCount++;
        }

        toast.success(`Updated ${successCount} service(s)`);
        setSelected([]);
        router.refresh();
    };

    const handleDelete = async (service: Service) => {
        if (!confirm(`Are you sure you want to delete "${service.name}"?`)) {
            return;
        }

        setUpdating(service.id);
        try {
            const result = await deleteService(service.id);

            if (!result.success) {
                throw new Error(result.error);
            }

            toast.success(`Deleted "${service.name}"`);
            router.refresh();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to delete service';
            toast.error(msg);
        } finally {
            setUpdating(null);
        }
    };

    const handleCreate = () => {
        setEditingService(undefined);
        setIsModalOpen(true);
    };

    const handleEdit = (service: Service) => {
        setEditingService(service);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingService(undefined);
    };

    const handleSaveModal = () => {
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
                    <ToggleLeft className="h-4 w-4 text-gray-600" />
                )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleEdit(service)}>
                <Pencil className="h-4 w-4" />
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Wrench className="h-8 w-8 text-blue-600" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Services</h1>
                        <p className="text-muted-foreground">{totalCount} services</p>
                    </div>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Service
                </Button>
            </div>

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
                    data={initialServices}
                    columns={columns}
                    searchPlaceholder="Search services..."
                    pageSize={20}
                    pageSizeOptions={[10, 20, 50, 100]}
                    selectable
                    onSelectionChange={setSelected}
                    actions={renderActions}
                    emptyMessage="No services found."
                    emptyAction={
                        <Button onClick={handleCreate}>Add Service</Button>
                    }
                />
            </div>

            {isModalOpen && (
                <ServiceModal
                    service={editingService}
                    onClose={handleCloseModal}
                    onSave={handleSaveModal}
                />
            )}
        </div>
    );
}
