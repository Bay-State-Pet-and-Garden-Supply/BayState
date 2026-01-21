'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, ExternalLink, Plus, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/admin/data-table';
import { toast } from 'sonner';
import { deleteBrand } from '@/app/admin/brands/actions';
import { BrandModal, Brand } from './BrandModal';

interface AdminBrandsClientProps {
    initialBrands: Brand[];
    totalCount: number;
}

export function AdminBrandsClient({ initialBrands, totalCount }: AdminBrandsClientProps) {
    const router = useRouter();
    const [selected, setSelected] = useState<Brand[]>([]);
    const [deleting, setDeleting] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBrand, setEditingBrand] = useState<Brand | undefined>(undefined);

    const handleDelete = async (brand: Brand) => {
        if (!confirm(`Are you sure you want to delete "${brand.name}"? products using this brand will have their brand unset.`)) {
            return;
        }

        setDeleting(brand.id);
        try {
            const result = await deleteBrand(brand.id);

            if (!result.success) {
                throw new Error(result.error);
            }

            toast.success(`Deleted "${brand.name}"`);
            router.refresh(); // Refresh server data
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to delete brand';
            toast.error(msg);
        } finally {
            setDeleting(null);
        }
    };

    const handleBulkDelete = async () => {
        if (selected.length === 0) return;

        if (!confirm(`Delete ${selected.length} brand(s)? This cannot be undone.`)) {
            return;
        }

        let successCount = 0;
        // We do this concurrently for simplicity in this MVP but ideally should be a bulk server action
        for (const brand of selected) {
            const result = await deleteBrand(brand.id);
            if (result.success) successCount++;
        }

        toast.success(`Deleted ${successCount} brand(s)`);
        setSelected([]);
        router.refresh();
    };

    const handleCreate = () => {
        setEditingBrand(undefined);
        setIsModalOpen(true);
    };

    const handleEdit = (brand: Brand) => {
        setEditingBrand(brand);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingBrand(undefined);
    };

    const handleSaveModal = () => {
        router.refresh();
    };

    const columns: Column<Brand>[] = [
        {
            key: 'logo_url',
            header: 'Logo',
            render: (value, row) => (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100">
                    {value ? (
                        <Image
                            src={String(value)}
                            alt={`${row.name} logo`}
                            width={40}
                            height={40}
                            className="h-10 w-10 object-contain"
                        />
                    ) : (
                        <span className="text-lg font-bold text-gray-600">
                            {row.name.charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>
            ),
        },
        {
            key: 'name',
            header: 'Brand Name',
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

    const renderActions = (brand: Brand) => (
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => handleEdit(brand)}>
                <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" asChild>
                <Link href={`/products?brand=${brand.slug}`} target="_blank">
                    <ExternalLink className="h-4 w-4" />
                </Link>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(brand)}
                disabled={deleting === brand.id}
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
                    <Tag className="h-8 w-8 text-purple-600" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Brands</h1>
                        <p className="text-muted-foreground">{totalCount} brands</p>
                    </div>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Brand
                </Button>
            </div>

            <div className="space-y-4">
                {selected.length > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-purple-50 px-4 py-2">
                        <span className="text-sm text-purple-700">
                            {selected.length} brand(s) selected
                        </span>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleBulkDelete}
                        >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete Selected
                        </Button>
                    </div>
                )}
                <DataTable
                    data={initialBrands}
                    columns={columns}
                    searchPlaceholder="Search brands..."
                    pageSize={20}
                    pageSizeOptions={[10, 20, 50, 100]}
                    selectable
                    onSelectionChange={setSelected}
                    actions={renderActions}
                    emptyMessage="No brands found. Add your first brand!"
                    emptyAction={
                        <Button onClick={handleCreate}>Add Brand</Button>
                    }
                />
            </div>

            {isModalOpen && (
                <BrandModal
                    brand={editingBrand}
                    onClose={handleCloseModal}
                    onSave={handleSaveModal}
                />
            )}
        </div>
    );
}
