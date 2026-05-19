import { notFound } from 'next/navigation';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { updatePreorderGroup, createPreorderBatch, deletePreorderBatch } from '@/lib/admin/preorder-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default async function PreorderGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: group, error: groupError } = await supabase
    .from('preorder_groups')
    .select('*')
    .eq('id', id)
    .single();

  if (groupError || !group) {
    notFound();
  }

  const { data: batches } = await supabase
    .from('preorder_batches')
    .select('*')
    .eq('preorder_group_id', id)
    .eq('is_active', true)
    .order('arrival_date', { ascending: true });

  const updateWithId = updatePreorderGroup.bind(null, id);

  return (
    <AdminPageShell
      title={group.name}
      description="Manage the customer-facing copy, pickup rules, and arrival batches for this pre-order group."
      icon={<CalendarDays className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/preorder-groups"
      backLabel="Back to pre-order groups"
    >
      <div className="grid gap-6 pb-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Group settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateWithId} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Group name</Label>
                <Input id="name" name="name" defaultValue={group.name} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" defaultValue={group.slug} required pattern="[a-z0-9-]+" />
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

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="minimum_quantity">Minimum quantity</Label>
                  <Input id="minimum_quantity" name="minimum_quantity" type="number" min="1" defaultValue={group.minimum_quantity} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_copy">Display copy</Label>
                  <textarea
                    id="display_copy"
                    name="display_copy"
                    defaultValue={group.display_copy || ''}
                    className="min-h-[96px] w-full rounded-[0.8rem] border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                  <Checkbox id="pickup_only" name="pickup_only" defaultChecked={group.pickup_only} className="mt-0.5" />
                  <span className="space-y-1">
                    <span className="block font-medium text-foreground">Pickup only</span>
                    <span className="block text-sm text-muted-foreground">Customers can reserve items for in-store pickup only.</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                  <Checkbox id="is_active" name="is_active" defaultChecked={group.is_active} className="mt-0.5" />
                  <span className="space-y-1">
                    <span className="block font-medium text-foreground">Active</span>
                    <span className="block text-sm text-muted-foreground">Inactive groups stay out of storefront selection and ordering.</span>
                  </span>
                </label>
              </div>

              <Button type="submit">Save group</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Arrival batches</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createPreorderBatch} className="space-y-4">
                <input type="hidden" name="preorder_group_id" value={id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="arrival_date">Arrival date</Label>
                    <Input id="arrival_date" name="arrival_date" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ordering_deadline">Ordering deadline</Label>
                    <Input id="ordering_deadline" name="ordering_deadline" type="datetime-local" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity">Capacity</Label>
                    <Input id="capacity" name="capacity" type="number" min="1" placeholder="Optional cap" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display_order">Display order</Label>
                    <Input id="display_order" name="display_order" type="number" defaultValue="0" />
                  </div>
                </div>
                <Button type="submit" variant="outline">
                  <Plus className="h-4 w-4" />
                  Add batch
                </Button>
              </form>

              <div className="mt-6 space-y-3">
                {!batches || batches.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                    No batches yet. Add the first arrival date above.
                  </div>
                ) : (
                  batches.map((batch) => (
                    <div key={batch.id} className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-muted/20 px-4 py-3">
                      <div className="space-y-1 text-sm">
                        <p className="font-medium text-foreground">
                          {new Date(batch.arrival_date).toLocaleDateString()}
                        </p>
                        <p className="text-muted-foreground">
                          {batch.ordering_deadline
                            ? `Order by ${new Date(batch.ordering_deadline).toLocaleDateString()}`
                            : 'No ordering deadline'}
                        </p>
                        {batch.capacity ? (
                          <p className="text-muted-foreground">Capacity {batch.capacity}</p>
                        ) : null}
                      </div>
                      <form action={deletePreorderBatch.bind(null, batch.id, id)}>
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete batch">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </form>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Batches</dt>
                  <dd className="font-medium text-foreground">{batches?.length || 0}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Minimum quantity</dt>
                  <dd className="font-medium text-foreground">{group.minimum_quantity} items</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Pickup only</dt>
                  <dd className="font-medium text-foreground">{group.pickup_only ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminPageShell>
  );
}
