import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const productGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  description: z.string().optional(),
  hero_image_url: z.string().url().optional().or(z.literal('')),
  default_product_id: z.string().uuid().optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  is_active: z.coerce.boolean().default(true),
})

export async function createProductGroup(formData: FormData) {
  const supabase = await createClient()

  const rawData = {
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description'),
    hero_image_url: formData.get('hero_image_url') || undefined,
    default_product_id: formData.get('default_product_id') || null,
    brand_id: formData.get('brand_id') || null,
    is_active: formData.get('is_active') === 'on',
  }

  const validatedData = productGroupSchema.parse(rawData)

  const { data, error } = await supabase
    .from('product_groups')
    .insert(validatedData)
    .select()
    .single()

  if (error) {
    console.error('Failed to create product group:', error)
    throw new Error(error.message || 'Failed to create product group')
  }

  revalidatePath('/admin/product-groups')
  redirect(`/admin/product-groups/${data.id}`)
}

export async function updateProductGroup(id: string, formData: FormData) {
  const supabase = await createClient()

  const rawData = {
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description'),
    hero_image_url: formData.get('hero_image_url') || undefined,
    default_product_id: formData.get('default_product_id') || null,
    brand_id: formData.get('brand_id') || null,
    is_active: formData.get('is_active') === 'on',
  }

  const validatedData = productGroupSchema.parse(rawData)

  const { error } = await supabase
    .from('product_groups')
    .update(validatedData)
    .eq('id', id)

  if (error) {
    console.error('Failed to update product group:', error)
    throw new Error(error.message || 'Failed to update product group')
  }

  revalidatePath('/admin/product-groups')
  revalidatePath(`/admin/product-groups/${id}`)
}

export async function deleteProductGroup(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('product_groups')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Failed to delete product group:', error)
    throw new Error(error.message || 'Failed to delete product group')
  }

  revalidatePath('/admin/product-groups')
  redirect('/admin/product-groups')
}

// Product Group Member Management
const productGroupMemberSchema = z.object({
  group_id: z.string().uuid(),
  product_id: z.string().uuid(),
  sort_order: z.coerce.number().int().default(0),
  is_default: z.coerce.boolean().default(false),
  display_label: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function addProductToGroup(formData: FormData) {
  const supabase = await createClient()

  const rawData = {
    group_id: formData.get('group_id'),
    product_id: formData.get('product_id'),
    sort_order: formData.get('sort_order') || 0,
    is_default: formData.get('is_default') === 'on',
    display_label: formData.get('display_label') || undefined,
  }

  const validatedData = productGroupMemberSchema.parse(rawData)

  const { error } = await supabase
    .from('product_group_products')
    .insert(validatedData)

  if (error) {
    console.error('Failed to add product to group:', error)
    throw new Error(error.message || 'Failed to add product to group')
  }

  revalidatePath(`/admin/product-groups/${validatedData.group_id}`)
}

export async function removeProductFromGroup(groupId: string, productId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('product_group_products')
    .delete()
    .eq('group_id', groupId)
    .eq('product_id', productId)

  if (error) {
    console.error('Failed to remove product from group:', error)
    throw new Error(error.message || 'Failed to remove product from group')
  }

  revalidatePath(`/admin/product-groups/${groupId}`)
}

export async function updateProductGroupPosition(
  groupId: string,
  productId: string,
  sortOrder: number
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('product_group_products')
    .update({ sort_order: sortOrder })
    .eq('group_id', groupId)
    .eq('product_id', productId)

  if (error) {
    console.error('Failed to update product position:', error)
    throw new Error(error.message || 'Failed to update position')
  }

  revalidatePath(`/admin/product-groups/${groupId}`)
}

export async function setGroupDefaultProduct(groupId: string, productId: string) {
  const supabase = await createClient()

  // First clear all defaults in the group
  await supabase
    .from('product_group_products')
    .update({ is_default: false })
    .eq('group_id', groupId)

  // Then set the new default
  const { error } = await supabase
    .from('product_group_products')
    .update({ is_default: true })
    .eq('group_id', groupId)
    .eq('product_id', productId)

  if (error) {
    console.error('Failed to set default product:', error)
    throw new Error(error.message || 'Failed to set default')
  }

  // Also update the group's default_product_id
  await supabase
    .from('product_groups')
    .update({ default_product_id: productId })
    .eq('id', groupId)

  revalidatePath(`/admin/product-groups/${groupId}`)
}

// Fetch functions for use in server components
export async function getProductGroups() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('product_groups')
    .select('*')
    .order('name')

  if (error) {
    console.error('Failed to fetch product groups:', error)
    return []
  }

  return data
}

export async function getProductGroup(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('product_groups')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Failed to fetch product group:', error)
    return null
  }

  return data
}

export async function getProductGroupMembers(groupId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('product_group_products')
    .select('*, product:products(*)')
    .eq('group_id', groupId)
    .order('sort_order')

  if (error) {
    console.error('Failed to fetch group members:', error)
    return []
  }

  return data
}

export async function getUngroupedProducts(search?: string) {
  const supabase = await createClient()

  // First get all products that are already in any group
  const { data: groupedProductIds } = await supabase
    .from('product_group_products')
    .select('product_id')

  const groupedIds = new Set(groupedProductIds?.map((p) => p.product_id) || [])

  // Then fetch products not in any group
  let query = supabase
    .from('products')
    .select('id, name, slug, price, images, stock_status')
    .not('id', 'in', Array.from(groupedIds))

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error } = await query.order('name').limit(50)

  if (error) {
    console.error('Failed to fetch ungrouped products:', error)
    return []
  }

  return data
}
