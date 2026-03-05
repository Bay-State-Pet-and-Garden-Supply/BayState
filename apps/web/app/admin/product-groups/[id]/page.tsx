import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, Trash2, Star } from 'lucide-react'
import { updateProductGroup, removeProductFromGroup, setGroupDefaultProduct, getProductGroupMembers, getUngroupedProducts } from '@/lib/admin/product-group-actions'

interface ProductGroupDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function ProductGroupDetailPage({ params }: ProductGroupDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch the group
  const { data: group, error } = await supabase
    .from('product_groups')
    .select('*, brand:brands(id, name)')
    .eq('id', id)
    .single()

  if (error || !group) {
    notFound()
  }

  // Fetch group members with product data
  const members = await getProductGroupMembers(id)

  // Fetch ungrouped products for adding
  const ungroupedProducts = await getUngroupedProducts()

  // Group products by first letter for easier selection
  const groupedProducts = ungroupedProducts.reduce((acc, product) => {
    const letter = product.name[0].toUpperCase()
    if (!acc[letter]) acc[letter] = []
    acc[letter].push(product)
    return acc
  }, {} as Record<string, typeof ungroupedProducts>)

  return (
    <div className="container mx-auto py-8">
      <Button variant="ghost" asChild className="mb-6">
        <Link href="/admin/product-groups">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Product Groups
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Group Info */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{group.name}</CardTitle>
                  <CardDescription className="mt-1">
                    <code className="bg-muted px-1 rounded text-sm">/products/{group.slug}</code>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!group.is_active && (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  {group.brand && (
                    <Badge variant="outline">{group.brand.name}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form action={updateProductGroup.bind(null, id)} className="space-y-4">
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
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input
                    id="slug"
                    name="slug"
                    defaultValue={group.slug}
                    pattern="[a-z0-9-]+"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    name="description"
                    defaultValue={group.description || ''}
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hero_image_url">Hero Image URL</Label>
                  <Input
                    id="hero_image_url"
                    name="hero_image_url"
                    defaultValue={group.hero_image_url || ''}
                    placeholder="https://..."
                    type="url"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    name="is_active"
                    defaultChecked={group.is_active}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="is_active" className="text-sm font-normal">
                    Active
                  </Label>
                </div>

                <div className="flex gap-4 pt-2">
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Members Management */}
        <div className="space-y-6">
          {/* Current Members */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Products in Group</CardTitle>
              <CardDescription>
                {members.length} product{members.length !== 1 ? 's' : ''} assigned
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No products added yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {members.map((member: Record<string, unknown>) => {
                    const product = member.product as Record<string, unknown> | undefined
                    if (!product) return null

                    return (
                      <li key={product.id as string} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          {(member.is_default as boolean) && (
                            <Star className="h-4 w-4 text-amber-500" />
                          )}
                          <span>{(product.name as string) || 'Unknown'}</span>
                          <Badge variant="outline" className="text-xs">
                            ${(product.price as number)?.toFixed(2)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          {!member.is_default && (
                            <form action={async () => {
                              'use server'
                              await setGroupDefaultProduct(id, product.id as string)
                            }}>
                              <Button type="submit" variant="ghost" size="sm" title="Set as default">
                                <Star className="h-4 w-4" />
                              </Button>
                            </form>
                          )}
                          <form action={async () => {
                            'use server'
                            await removeProductFromGroup(id, product.id as string)
                          }}>
                            <Button type="submit" variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Add Products */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Products</CardTitle>
              <CardDescription>
                Products not in any group
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ungroupedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  All products are already in groups.
                </p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {Object.entries(groupedProducts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([letter, products]) => (
                      <div key={letter}>
                        <p className="text-xs font-medium text-muted-foreground mb-1">{letter}</p>
                        {products.map((product) => (
                          <form
                            key={product.id}
                            action={async () => {
                              'use server'
                              const { addProductToGroup } = await import('@/lib/admin/product-group-actions')
                              const formData = new FormData()
                              formData.append('group_id', id)
                              formData.append('product_id', product.id)
                              await addProductToGroup(formData)
                            }}
                            className="flex items-center justify-between p-2 hover:bg-muted/50 rounded group"
                          >
                            <span className="text-sm truncate flex-1">{product.name}</span>
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Plus className="h-4 w-4" />
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
    </div>
  )
}
