import Link from 'next/link';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { deleteProductGroup } from '@/lib/admin/product-group-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default async function ProductGroupsPage() {
  const supabase = await createClient();

  const { data: groups, error } = await supabase.from('product_groups').select('*').order('name');
  if (error) {
    console.error('Failed to fetch product groups:', error);
  }

  const { data: memberCounts } = await supabase.from('product_group_products').select('group_id, product_id');
  const memberCountMap = new Map<string, number>();
  if (memberCounts) {
    for (const member of memberCounts) {
      const count = memberCountMap.get(member.group_id) || 0;
      memberCountMap.set(member.group_id, count + 1);
    }
  }

  return (
    <AdminPageShell
      title="Product groups"
      description="Keep related products together under one storefront page and review each group from one calm queue."
      icon={<Boxes className="h-5 w-5" />}
      eyebrow="Queue view"
      actions={
        <Button asChild>
          <Link href="/admin/product-groups/new">
            <Plus className="h-4 w-4" />
            New group
          </Link>
        </Button>
      }
    >
      {!groups || groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">No product groups yet.</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Product groups combine related products, such as different sizes, under one storefront page.
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/product-groups/new">Create your first group</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 pb-6">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardContent className="py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground">{group.name}</h2>
                      <Badge variant="outline">{memberCountMap.get(group.id) || 0} products</Badge>
                      {!group.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">Slug: /products/{group.slug}</p>
                    {group.description ? <p className="text-sm text-foreground/85 line-clamp-2">{group.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/product-groups/${group.id}`}>
                        <Pencil className="h-4 w-4" />
                        Manage
                      </Link>
                    </Button>
                    <form action={deleteProductGroup.bind(null, group.id)}>
                      <Button type="submit" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminPageShell>
  );
}
