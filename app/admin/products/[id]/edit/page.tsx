import { createClient } from '@/lib/supabase/server'
import { updateProduct } from './actions'
import { assignProductToPreorderGroup, updateProductPickupOnly, getPreorderGroups, getProductPreorderAssignment } from '@/lib/admin/preorder-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notFound } from 'next/navigation'
import { PickupOnlyToggle } from './pickup-only-toggle'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (!product) {
    notFound()
  }

  const groups = await getPreorderGroups()
  const assignment = await getProductPreorderAssignment(id)

  const updateProductWithId = updateProduct.bind(null, id)
  const assignGroup = assignProductToPreorderGroup
  const setPickupOnly = updateProductPickupOnly

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit Product</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateProductWithId} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name</Label>
              <Input id="name" name="name" defaultValue={product.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" defaultValue={product.slug} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input id="price" name="price" type="number" step="0.01" defaultValue={product.price} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock_status">Stock Status</Label>
              <select 
                name="stock_status" 
                id="stock_status" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                defaultValue={product.stock_status}
              >
                <option value="in_stock">In Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="pre_order">Pre-Order</option>
              </select>
            </div>
            <div className="flex gap-4 pt-2">
              <Button type="submit">Update Product</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fulfillment Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <PickupOnlyToggle
              initialValue={product.pickup_only || false}
              productId={id}
              action={setPickupOnly}
            />
            <p className="text-xs text-muted-foreground">
              If checked, this product can only be picked up (not delivered)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Pre-Order Group</Label>
              <form action={assignGroup} className="space-y-2">
              <input type="hidden" name="product_id" value={id} />
              <select
                name="preorder_group_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                defaultValue={assignment?.preorder_group_id || ''}
              >
                <option value="">None (not a pre-order product)</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm">
                {assignment ? 'Update Assignment' : 'Assign to Group'}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Assign this product to a pre-order group for batch/arrival date selection
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
