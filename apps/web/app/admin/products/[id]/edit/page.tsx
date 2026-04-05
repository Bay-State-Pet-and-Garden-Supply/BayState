import { createClient } from '@/lib/supabase/server'
import { assignProductToPreorderGroup, updateProductPickupOnly, getPreorderGroups, getProductPreorderAssignment } from '@/lib/admin/preorder-actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { normalizeProductStorefrontSettings } from '@/lib/product-storefront-settings'
import { notFound } from 'next/navigation'
import { PickupOnlyToggle } from './pickup-only-toggle'
import { ProductEditForm } from '@/components/admin/products/ProductEditForm'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: product } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      sku,
      description,
      long_description,
      price,
      weight,
      brand_id,
      search_keywords,
      gtin,
      availability,
      minimum_quantity,
      is_special_order,
      is_taxable,
      shopsite_pages,
      stock_status,
      quantity,
      low_stock_threshold,
      published_at,
      images,
      product_categories(category_id),
      storefront_settings:product_storefront_settings(is_featured, pickup_only)
    `)
    .eq('id', id)
    .single()

  if (!product) {
    notFound()
  }

  const groups = await getPreorderGroups()
  const assignment = await getProductPreorderAssignment(id)
  const storefrontSettings = normalizeProductStorefrontSettings(product.storefront_settings)

  const assignGroup = assignProductToPreorderGroup
  const setPickupOnly = updateProductPickupOnly

  // Map database fields to the component expectations
  const formProduct = {
    ...product,
    category_ids: (product.product_categories || [])
      .map((productCategory: { category_id?: string | null }) => productCategory.category_id)
      .filter((categoryId: string | null | undefined): categoryId is string => Boolean(categoryId)),
    product_on_pages: product.shopsite_pages,
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <ProductEditForm product={formProduct} />

      <Card>
        <CardHeader>
          <CardTitle>Fulfillment Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <PickupOnlyToggle
              initialValue={storefrontSettings.pickup_only}
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
