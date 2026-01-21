'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
    Pencil,
    Trash2,
    ChevronRight,
    ChevronDown,
    Star,
    GripVertical,
    Plus,
    FolderTree
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { deleteCategory } from '@/app/admin/categories/actions';
import { CategoryModal, Category } from './CategoryModal';

interface AdminCategoriesClientProps {
    initialCategories: Category[];
    totalCount: number;
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

export function AdminCategoriesClient({ initialCategories, totalCount }: AdminCategoriesClientProps) {
    const router = useRouter();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState<string | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | undefined>(undefined);
    const [parentForNew, setParentForNew] = useState<string | null>(null);

    const tree = buildCategoryTree(initialCategories);

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
        setExpandedIds(new Set(initialCategories.map((c) => c.id)));
    };

    const collapseAll = () => {
        setExpandedIds(new Set());
    };

    const handleDelete = async (category: Category) => {
        const childCount = initialCategories.filter((c) => c.parent_id === category.id).length;
        const message = childCount > 0
            ? `Delete "${category.name}" and its ${childCount} subcategories?`
            : `Delete "${category.name}"?`;

        if (!confirm(message)) return;

        setDeleting(category.id);
        try {
            const result = await deleteCategory(category.id);
            if (!result.success) {
                throw new Error(result.error);
            }
            toast.success(`Deleted "${category.name}"`);
            router.refresh();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to delete category';
            toast.error(msg);
        } finally {
            setDeleting(null);
        }
    };

    const handleCreate = (parentId: string | null = null) => {
        setEditingCategory(undefined);
        setParentForNew(parentId);
        setIsModalOpen(true);
    };

    const handleEdit = (category: Category) => {
        setEditingCategory(category);
        setParentForNew(null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingCategory(undefined);
        setParentForNew(null);
    };

    const handleSaveModal = () => {
        router.refresh();
    };

    const renderCategory = (node: CategoryNode, depth: number = 0) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);

        return (
            <div key={node.id}>
                <div
                    className={`flex items-center gap-2 rounded-lg border bg-white p-3 hover:bg-gray-50 ${depth > 0 ? 'ml-6 border-l-4 border-l-gray-200' : ''
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
                                <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs py-0.5">
                                    {node.children.length} subcategories
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-gray-600">/{node.slug}</p>
                    </div>

                    {/* Order */}
                    <Badge variant="outline" className="bg-gray-100 text-gray-600 border-transparent text-xs py-0.5">
                        Order: {node.display_order}
                    </Badge>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleCreate(node.id)} title="Add Subcategory">
                            <Plus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(node)}>
                            <Pencil className="h-4 w-4" />
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <FolderTree className="h-8 w-8 text-green-600" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
                        <p className="text-muted-foreground">{totalCount} categories</p>
                    </div>
                </div>
                <Button onClick={() => handleCreate(null)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Category
                </Button>
            </div>

            {initialCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16">
                    <p className="text-lg font-medium text-gray-600">No categories yet</p>
                    <p className="mt-1 text-sm text-gray-600">
                        Create your first category to organize products
                    </p>
                    <Button className="mt-4" onClick={() => handleCreate(null)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Category
                    </Button>
                </div>
            ) : (
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
            )}

            {isModalOpen && (
                <CategoryModal
                    category={editingCategory}
                    allCategories={initialCategories}
                    defaultParentId={parentForNew}
                    onClose={handleCloseModal}
                    onSave={handleSaveModal}
                />
            )}
        </div>
    );
}
