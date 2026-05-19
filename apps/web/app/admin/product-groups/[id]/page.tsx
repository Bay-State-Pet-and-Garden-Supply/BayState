import { notFound } from 'next/navigation';
import { Boxes, Plus, Star, Trash2 } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import {
  updateProductGroup,
  removeProductFromGroup,
  setGroupDefaultProduct,
  getProductGroupMembers,
  getUngroupedProducts,
} from '@/lib/admin/product-group-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ProductGroupDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductGroupDetailPage({ params }: ProductGroupDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: group, error } = await supabase
    .from('product_groups')
    .select('*, brand:brands(id, name)')
    .eq('id', id)
    .single();

  if (error || !group) {
    notFound();
  }

  const members = await getProductGroupMembers(id);
  const ungroupedProducts = await getUngroupedProducts();

  const groupedProducts = ungroupedProducts.reduce((acc, product) => {
    const letter = product.name[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(product);
    return acc;
  }, {} as Record<string, typeof ungroupedProducts>);

  return (
    <AdminPageShell
      title={group.name}
      description="Keep grouped products together, choose the default product, and maintain the storefront copy in one workspace."
      icon={<Boxes className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/product-groups"
      backLabel="Back to product groups"
    >
      <div className="grid gap-6 pb-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Group details</CardTitle>
                <CardDescription>
                  Manage the shared product page, hero image, and storefront visibility.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!group.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
                {group.brand ? <Badge variant="outline">{group.brand.name}</Badge> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={updateProductGroup.bind(null, id)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Group name</Label>
                <Input id="name" name="name" defaultValue={group.name} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL slug</Label>
                <Input id="slug" name="slug" defaultValue={group.slug} pattern="[a-z0-9-]+" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  defaultValue={group.description || ''}
                  className="min-h-[96px] w-full rounded-[0.8rem] border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero_image_url">Hero image URL</Label>
                <Input
                  id="hero_image_url"
                  name="hero_image_url"
                  defaultValue={group.hero_image_url || ''}
                  placeholder="https://..."
                  type="url"
                />
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                <input type="checkbox" id="is_active" name="is_active" defaultChecked={group.is_active} className="mt-1 h-4 w-4" />
                <span className="space-y-1">
                  <span className="block font-medium text-foreground">Active on the storefront</span>
                  <span className="block text-sm text-muted-foreground">Inactive groups stay hidden from customers until they are ready.</span>
                </span>
              </label>

              <Button type="submit">Save changes</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Products in this group</CardTitle>
              <CardDescription>
                {members.length} product{members.length === 1 ? '' : 's'} assigned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  No products added yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {members.map((member: Record<string, unknown>) => {
                    const product = member.product as Record<string, unknown> | undefined;
                    if (!product) return null;

                    return (
                      <li key={product.id as string} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3">
                        <div className="min-w-0 space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            {(member.is_default as boolean) ? <Star className="h-4 w-4 text-amber-500" /> : null}
                            <span className="truncate font-medium text-foreground">{(product.name as string) || 'Unknown'}</span>
                          </div>
                          <Badge variant="outline">${(product.price as number)?.toFixed(2)}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          {!(member.is_default as boolean) ? (
                            <form
                              action={async () => {
                                'use server';
                                await setGroupDefaultProduct(id, product.id as string);
                              }}
                            >
                              <Button type="submit" variant="ghost" size="sm">
                                <Star className="h-4 w-4" />
                                Make default
                              </Button>
                            </form>
                          ) : null}
                          <form
                            action={async () => {
                              'use server';
                              await removeProductFromGroup(id, product.id as string);
                            }}
                          >
                            <Button type="submit" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add products</CardTitle>
              <CardDescription>Products that are not already assigned to another group.</CardDescription>
            </CardHeader>
            <CardContent>
              {ungroupedProducts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  All products are already in groups.
                </div>
              ) : (
                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {Object.entries(groupedProducts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([letter, products]) => (
                      <div key={letter} className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{letter}</p>
                        {products.map((product) => (
                          <form
                            key={product.id}
                            action={async () => {
                              'use server';
                              const { addProductToGroup } = await import('@/lib/admin/product-group-actions');
                              const formData = new FormData();
                              formData.append('group_id', id);
                              formData.append('product_id', product.id);
                              await addProductToGroup(formData);
                            }}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-3 py-2"
                          >
                            <span className="truncate text-sm text-foreground">{product.name}</span>
                            <Button type="submit" variant="ghost" size="sm">
                              <Plus className="h-4 w-4" />
                              Add
                            </Button>
                          </form>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminPageShell>
  );
}
