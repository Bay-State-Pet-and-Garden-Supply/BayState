'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/admin/data-table';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from 'react';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  created_at: string;
}

interface BrandsDataTableProps {
  brands: Brand[];
}

export function BrandsDataTable({ brands }: BrandsDataTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Brand[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (brand: Brand) => {
    setDeleting(brand.id);
    try {
      const response = await fetch(`/api/admin/brands/${brand.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete brand');
      }

      toast.success(`Deleted "${brand.name}"`);
      router.refresh();
    } catch (error) {
      toast.error('Failed to delete brand');
      console.error(error);
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.length === 0) return;

    let successCount = 0;
    for (const brand of selected) {
      try {
        const response = await fetch(`/api/admin/brands/${brand.id}`, {
          method: 'DELETE',
        });
        if (response.ok) successCount++;
      } catch {
        // Continue with next
      }
    }

    toast.success(`Deleted ${successCount} brand(s)`);
    setSelected([]);
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
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/admin/brands/${brand.id}/edit`}>
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/products?brand=${brand.slug}`} target="_blank">
          <ExternalLink className="h-4 w-4" />
        </Link>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={deleting === brand.id}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{brand.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(brand)}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-purple-50 px-4 py-2">
          <span className="text-sm text-purple-700">
            {selected.length} brand(s) selected
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Selected Brands</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {selected.length} brand(s)? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleBulkDelete}
                  className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                >
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      <DataTable
        data={brands}
        columns={columns}
        searchPlaceholder="Search brands..."
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
        selectable
        onSelectionChange={setSelected}
        actions={renderActions}
        emptyMessage="No brands found. Add your first brand!"
        emptyAction={
          <Button asChild>
            <Link href="/admin/brands/new">Add Brand</Link>
          </Button>
        }
      />
    </div>
  );
}
