'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  display_order: number;
  image_url: string | null;
  is_featured: boolean;
}

interface CategoryFormProps {
  category?: Category;
  allCategories: Category[];
  defaultParentId?: string | null;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function CategoryForm({
  category,
  allCategories,
  defaultParentId,
}: CategoryFormProps) {
  const router = useRouter();
  const isEditing = Boolean(category);

  const [name, setName] = useState(category?.name || '');
  const [slug, setSlug] = useState(category?.slug || '');
  const [description, setDescription] = useState(category?.description || '');
  const [parentId, setParentId] = useState<string | null>(
    category?.parent_id ?? defaultParentId ?? null
  );
  const [displayOrder, setDisplayOrder] = useState(category?.display_order ?? 0);
  const [imageUrl, setImageUrl] = useState(category?.image_url || '');
  const [isFeatured, setIsFeatured] = useState(category?.is_featured ?? false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter out current category and its children from parent options
  const getDescendantIds = (catId: string): string[] => {
    const directChildren = allCategories.filter((c) => c.parent_id === catId);
    return [
      catId,
      ...directChildren.flatMap((c) => getDescendantIds(c.id)),
    ];
  };

  const excludeIds = category ? getDescendantIds(category.id) : [];
  const parentOptions = allCategories.filter(
    (c) => !excludeIds.includes(c.id)
  );

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!isEditing || slug === generateSlug(category?.name || '')) {
      setSlug(generateSlug(newName));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      name,
      slug,
      description: description || null,
      parent_id: parentId,
      display_order: displayOrder,
      image_url: imageUrl || null,
      is_featured: isFeatured,
    };

    try {
      const url = isEditing
        ? `/api/admin/categories/${category!.id}`
        : '/api/admin/categories';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save category');
      }

      toast.success(isEditing ? 'Category updated' : 'Category created');
      router.push('/admin/categories');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save category';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!category) return;

    const childCount = allCategories.filter(
      (c) => c.parent_id === category.id
    ).length;
    const message =
      childCount > 0
        ? `Delete "${category.name}" and its ${childCount} subcategories?`
        : `Delete "${category.name}"?`;

    if (!confirm(message)) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete category');
      }

      toast.success(`Deleted "${category.name}"`);
      router.push('/admin/categories');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete category';
      setError(message);
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Category Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={handleNameChange}
              placeholder="e.g., Dog Food"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug *</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g., dog-food"
              required
              aria-describedby="slug-help"
            />
            <p id="slug-help" className="text-sm text-muted-foreground">
              URL-friendly identifier. Auto-generated from name.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this category"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent_id">Parent Category</Label>
            <select
              id="parent_id"
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">None (Top Level)</option>
              {parentOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_order">Display Order</Label>
            <Input
              id="display_order"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
              min={0}
              aria-describedby="display-order-help"
            />
            <p id="display-order-help" className="text-sm text-muted-foreground">
              Lower numbers appear first.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.png"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_featured"
              checked={isFeatured}
              onCheckedChange={(checked) => setIsFeatured(checked === true)}
            />
            <Label htmlFor="is_featured" className="cursor-pointer">
              Featured Category
            </Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting || isDeleting}>
              {isSubmitting
                ? isEditing
                  ? 'Updating...'
                  : 'Creating...'
                : isEditing
                  ? 'Update Category'
                  : 'Create Category'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/admin/categories')}
              disabled={isSubmitting || isDeleting}
            >
              Cancel
            </Button>
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
