import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { updatePreorderGroup, createPreorderBatch, deletePreorderBatch } from '@/lib/admin/preorder-actions'

export default async function PreorderGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: group, error: groupError } = await supabase
    .from('preorder_groups')
    .select('*')
    .eq('id', id)
    .single()

  if (groupError || !group) {
    notFound()
  }

  const { data: batches } = await supabase
    .from('preorder_batches')
    .select('*')
    .eq('preorder_group_id', id)
    .eq('is_active', true)
    .order('arrival_date', { ascending: true })

  const updateWithId = updatePreorderGroup.bind(null, id)
  const createBatch = createPreorderBatch

  return (
    <div className="container mx-auto py-8">
      <Link
        href="/admin/preorder-groups"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Groups
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Group Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateWithId} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Group Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={group.name}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={group.slug}
                  required
                  pattern="[a-z0-9-]+"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  defaultValue={group.description || ''}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minimum_quantity">Minimum Quantity</Label>
                <Input
                  id="minimum_quantity"
                  name="minimum_quantity"
                  type="number"
                  min="1"
                  defaultValue={group.minimum_quantity}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_copy">Display Copy</Label>
                <textarea
                  id="display_copy"
                  name="display_copy"
                  defaultValue={group.display_copy || ''}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pickup_only"
                  name="pickup_only"
                  defaultChecked={group.pickup_only}
                />
                <Label htmlFor="pickup_only">Pickup only</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  name="is_active"
                  defaultChecked={group.is_active}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>

              <Button type="submit">Update Group</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Arrival Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createBatch} className="space-y-4 mb-6">
                <input type="hidden" name="preorder_group_id" value={id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="arrival_date">Arrival Date</Label>
                    <Input
                      id="arrival_date"
                      name="arrival_date"
                      type="date"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ordering_deadline">Ordering Deadline (optional)</Label>
                    <Input
                      id="ordering_deadline"
                      name="ordering_deadline"
                      type="datetime-local"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity">Capacity (optional)</Label>
                    <Input
                      id="capacity"
                      name="capacity"
                      type="number"
                      min="1"
                      placeholder="Max quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display_order">Display Order</Label>
                    <Input
                      id="display_order"
                      name="display_order"
                      type="number"
                      defaultValue="0"
                    />
                  </div>
                </div>
                <Button type="submit" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Batch
                </Button>
              </form>

              {!batches || batches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No batches yet. Add the first arrival date above.
                </p>
              ) : (
                <div className="space-y-2">
                  {batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium">
                          {new Date(batch.arrival_date).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {batch.ordering_deadline
                            ? `Order by ${new Date(batch.ordering_deadline).toLocaleDateString()}`
                            : 'No deadline'}
                          {batch.capacity && ` • Capacity: ${batch.capacity}`}
                        </p>
                      </div>
                      <form action={deletePreorderBatch.bind(null, batch.id, id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total Batches</dt>
                  <dd className="font-medium">{batches?.length || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Minimum per Batch</dt>
                  <dd className="font-medium">{group.minimum_quantity} items</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Pickup Only</dt>
                  <dd className="font-medium">{group.pickup_only ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
