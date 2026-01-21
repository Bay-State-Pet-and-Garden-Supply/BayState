'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  Star,
  GripVertical,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  display_order: number;
  image_url: string | null;
  is_featured: boolean;
  created_at: string;
}

interface CategoriesClientProps {
  categories: Category[];
}

interface CategoryNode extends Category {
  children: CategoryNode[];
}

function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const categoryMap = new Map<string, CategoryNode>();
  const rootCategories: CategoryNode[] = [];

  // First pass: create nodes
  for (const cat of categories) {
    categoryMap.set(cat.id, { ...cat, children: [] });
  }

  // Second pass: build tree
  for (const cat of categories) {
    const node = categoryMap.get(cat.id)!;
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      categoryMap.get(cat.parent_id)!.children.push(node);
    } else {
      rootCategories.push(node);
    }
  }

  return rootCategories;
}

export function CategoriesClient({ categories }: CategoriesClientProps) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

  const tree = buildCategoryTree(categories);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const expandAll = () => {
    setExpandedIds(new Set(categories.map((c) => c.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleDelete = async (category: Category) => {
    const childCount = categories.filter((c) => c.parent_id === category.id).length;
    const message = childCount > 0
      ? `Delete "${category.name}" and its ${childCount} subcategories?`
      : `Delete "${category.name}"?`;

    if (!confirm(message)) return;

    setDeleting(category.id);
    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete category');
      }

      toast.success(`Deleted "${category.name}"`);
      router.refresh();
    } catch (error) {
      toast.error('Failed to delete category');
      console.error(error);
    } finally {
      setDeleting(null);
    }
  };

  const renderCategory = (node: CategoryNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 rounded-lg border bg-white p-3 hover:bg-gray-50 ${
            depth > 0 ? 'ml-6 border-l-4 border-l-gray-200' : ''
          }`}
          style={{ marginLeft: depth > 0 ? `${depth * 24}px` : 0 }}
        >
          {/* Drag handle */}
          <GripVertical className="h-4 w-4 cursor-grab text-gray-600" />

          {/* Expand/collapse */}
          <button
            onClick={() => toggleExpand(node.id)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          {/* Image */}
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100">
            {node.image_url ? (
              <Image
                src={node.image_url}
                alt={node.name}
                width={40}
                height={40}
                className="h-10 w-10 object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-gray-600">
                {node.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Name and info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{node.name}</span>
              {node.is_featured && (
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              )}
              {hasChildren && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {node.children.length} subcategories
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">/{node.slug}</p>
          </div>

          {/* Order */}
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            Order: {node.display_order}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/admin/categories/new?parent=${node.id}`}>
                <Plus className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/admin/categories/${node.id}/edit`}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(node)}
              disabled={deleting === node.id}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children.map((child) => renderCategory(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16">
        <p className="text-lg font-medium text-gray-600">No categories yet</p>
        <p className="mt-1 text-sm text-gray-600">
          Create your first category to organize products
        </p>
        <Button asChild className="mt-4">
          <Link href="/admin/categories/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={expandAll}>
          Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          Collapse All
        </Button>
      </div>

      <div className="space-y-2">
        {tree.map((node) => renderCategory(node))}
      </div>
    </div>
  );
}
