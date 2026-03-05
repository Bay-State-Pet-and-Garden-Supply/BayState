import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit, Trash2, Box } from 'lucide-react'
import { deleteProductGroup } from '@/lib/admin/product-group-actions'

export default async function ProductGroupsPage() {
  const supabase = await createClient()

  // Fetch all product groups
  const { data: groups, error } = await supabase
    .from('product_groups')
    .select('*')
    .order('name')

  if (error) {
    console.error('Failed to fetch product groups:', error)
  }

  // Fetch member counts for each group
  const { data: memberCounts } = await supabase
    .from('product_group_products')
    .select('group_id, product_id')

  const memberCountMap = new Map<string, number>()
  if (memberCounts) {
    for (const member of memberCounts) {
      const count = memberCountMap.get(member.group_id) || 0
      memberCountMap.set(member.group_id, count + 1)
    }
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Product Groups</h1>
        <Button asChild>
          <Link href="/admin/product-groups/new">
            <Plus className="mr-2 h-4 w-4" />
            New Group
          </Link>
        </Button>
      </div>

      {!groups || groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Box className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No product groups yet.</p>
            <p className="text-sm text-muted-foreground mb-4">
              Product groups let you combine related products (like different sizes) under a single page.
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/product-groups/new">Create your first group</Link>
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
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {memberCountMap.get(group.id) || 0} products
                      </Badge>
                      {!group.is_active && (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Slug: <code className="bg-muted px-1 rounded">{group.slug}</code>
                    </p>
                    {group.description && (
                      <p className="text-sm mt-2 text-muted-foreground line-clamp-2">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/product-groups/${group.id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Manage
                      </Link>
                    </Button>
                    <form action={deleteProductGroup.bind(null, group.id)}>
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
