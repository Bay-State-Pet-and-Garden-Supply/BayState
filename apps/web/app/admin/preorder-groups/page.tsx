import Link from 'next/link';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { deletePreorderGroup } from '@/lib/admin/preorder-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default async function PreorderGroupsPage() {
  const supabase = await createClient();

  const { data: groups, error } = await supabase.from('preorder_groups').select('*').order('name');
  if (error) {
    console.error('Failed to fetch preorder groups:', error);
  }

  const { data: batchCounts } = await supabase
    .from('preorder_batches')
    .select('preorder_group_id, id')
    .eq('is_active', true);

  const batchCountMap = new Map<string, number>();
  if (batchCounts) {
    for (const batch of batchCounts) {
      const count = batchCountMap.get(batch.preorder_group_id) || 0;
      batchCountMap.set(batch.preorder_group_id, count + 1);
    }
  }

  return (
    <AdminPageShell
      title="Pre-order groups"
      description="Manage pickup-only or minimum-order storefront programs and the batches attached to each one."
      icon={<CalendarDays className="h-5 w-5" />}
      eyebrow="Queue view"
      actions={
        <Button asChild>
          <Link href="/admin/preorder-groups/new">
            <Plus className="h-4 w-4" />
            New group
          </Link>
        </Button>
      }
    >
      {!groups || groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">No pre-order groups yet.</p>
            <Button asChild variant="outline">
              <Link href="/admin/preorder-groups/new">Create your first group</Link>
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
                      {group.pickup_only ? <Badge variant="warning">Pickup only</Badge> : null}
                      {!group.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Slug: {group.slug} · Minimum quantity: {group.minimum_quantity}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {batchCountMap.get(group.id) || 0} active batch{(batchCountMap.get(group.id) || 0) === 1 ? '' : 'es'}
                    </p>
                    {group.description ? <p className="text-sm text-foreground/85">{group.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/preorder-groups/${group.id}`}>
                        <Pencil className="h-4 w-4" />
                        Manage
                      </Link>
                    </Button>
                    <form action={deletePreorderGroup.bind(null, group.id)}>
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
