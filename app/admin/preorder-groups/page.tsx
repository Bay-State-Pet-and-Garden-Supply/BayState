import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { deletePreorderGroup } from '@/lib/admin/preorder-actions'

export default async function PreorderGroupsPage() {
  const supabase = await createClient()
  
  const { data: groups, error } = await supabase
    .from('preorder_groups')
    .select('*')
    .order('name')

  if (error) {
    console.error('Failed to fetch preorder groups:', error)
  }

  const { data: batchCounts } = await supabase
    .from('preorder_batches')
    .select('preorder_group_id, id')
    .eq('is_active', true)

  const batchCountMap = new Map<string, number>()
  if (batchCounts) {
    for (const batch of batchCounts) {
      const count = batchCountMap.get(batch.preorder_group_id) || 0
      batchCountMap.set(batch.preorder_group_id, count + 1)
    }
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Pre-Order Groups</h1>
        <Button asChild>
          <Link href="/admin/preorder-groups/new">
            <Plus className="mr-2 h-4 w-4" />
            New Group
          </Link>
        </Button>
      </div>

      {!groups || groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No pre-order groups yet.</p>
            <Button asChild variant="outline">
              <Link href="/admin/preorder-groups/new">Create your first group</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold">{group.name}</h2>
                      {group.pickup_only && (
                        <Badge variant="warning" className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-none">
                          Pickup Only
                        </Badge>
                      )}
                      {!group.is_active && (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Slug: {group.slug} • Min Qty: {group.minimum_quantity}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {batchCountMap.get(group.id) || 0} active batch(es)
                    </p>
                    {group.description && (
                      <p className="text-sm mt-2">{group.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/preorder-groups/${group.id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Manage
                      </Link>
                    </Button>
                    <form action={deletePreorderGroup.bind(null, group.id)}>
                      <Button type="submit" variant="destructive" size="sm">
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
    </div>
  )
}
