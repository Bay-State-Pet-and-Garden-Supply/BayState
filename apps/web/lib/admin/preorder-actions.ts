import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const preorderGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  description: z.string().optional(),
  minimum_quantity: z.coerce.number().int().min(1, 'Minimum quantity must be at least 1'),
  pickup_only: z.coerce.boolean().default(true),
  display_copy: z.string().optional(),
  is_active: z.coerce.boolean().default(true),
})

export async function createPreorderGroup(formData: FormData) {
  const supabase = await createClient()
  
  const rawData = {
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description'),
    minimum_quantity: formData.get('minimum_quantity'),
    pickup_only: formData.get('pickup_only') === 'on',
    display_copy: formData.get('display_copy'),
    is_active: formData.get('is_active') === 'on',
  }

  const validatedData = preorderGroupSchema.parse(rawData)

  const { data, error } = await supabase
    .from('preorder_groups')
    .insert(validatedData)
    .select()
    .single()

  if (error) {
    console.error('Failed to create preorder group:', error)
    throw new Error(error.message || 'Failed to create preorder group')
  }

  revalidatePath('/admin/preorder-groups')
  redirect(`/admin/preorder-groups/${data.id}`)
}

export async function updatePreorderGroup(id: string, formData: FormData) {
  const supabase = await createClient()
  
  const rawData = {
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description'),
    minimum_quantity: formData.get('minimum_quantity'),
    pickup_only: formData.get('pickup_only') === 'on',
    display_copy: formData.get('display_copy'),
    is_active: formData.get('is_active') === 'on',
  }

  const validatedData = preorderGroupSchema.parse(rawData)

  const { error } = await supabase
    .from('preorder_groups')
    .update(validatedData)
    .eq('id', id)

  if (error) {
    console.error('Failed to update preorder group:', error)
    throw new Error(error.message || 'Failed to update preorder group')
  }

  revalidatePath('/admin/preorder-groups')
  revalidatePath(`/admin/preorder-groups/${id}`)
}

export async function deletePreorderGroup(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('preorder_groups')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Failed to delete preorder group:', error)
    throw new Error(error.message || 'Failed to delete preorder group')
  }

  revalidatePath('/admin/preorder-groups')
  redirect('/admin/preorder-groups')
}

const preorderBatchSchema = z.object({
  preorder_group_id: z.string().uuid('Invalid group ID'),
  arrival_date: z.string().min(1, 'Arrival date is required'),
  ordering_deadline: z.string().optional(),
  capacity: z.coerce.number().int().optional().nullable(),
  display_order: z.coerce.number().int().default(0),
  is_active: z.coerce.boolean().default(true),
})

export async function createPreorderBatch(formData: FormData) {
  const supabase = await createClient()
  
  const rawData = {
    preorder_group_id: formData.get('preorder_group_id'),
    arrival_date: formData.get('arrival_date'),
    ordering_deadline: formData.get('ordering_deadline'),
    capacity: formData.get('capacity') || null,
    display_order: formData.get('display_order') || 0,
    is_active: formData.get('is_active') === 'on',
  }

  const validatedData = preorderBatchSchema.parse(rawData)

  const { data, error } = await supabase
    .from('preorder_batches')
    .insert(validatedData)
    .select()
    .single()

  if (error) {
    console.error('Failed to create preorder batch:', error)
    throw new Error(error.message || 'Failed to create preorder batch')
  }

  revalidatePath(`/admin/preorder-groups/${rawData.preorder_group_id}`)
  redirect(`/admin/preorder-groups/${rawData.preorder_group_id}`)
}

export async function updatePreorderBatch(id: string, formData: FormData) {
  const supabase = await createClient()
  
  const rawData = {
    preorder_group_id: formData.get('preorder_group_id'),
    arrival_date: formData.get('arrival_date'),
    ordering_deadline: formData.get('ordering_deadline'),
    capacity: formData.get('capacity') || null,
    display_order: formData.get('display_order') || 0,
    is_active: formData.get('is_active') === 'on',
  }

  const validatedData = preorderBatchSchema.parse(rawData)

  const { error } = await supabase
    .from('preorder_batches')
    .update(validatedData)
    .eq('id', id)

  if (error) {
    console.error('Failed to update preorder batch:', error)
    throw new Error(error.message || 'Failed to update preorder batch')
  }

  revalidatePath(`/admin/preorder-groups/${rawData.preorder_group_id}`)
}

export async function deletePreorderBatch(id: string, groupId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('preorder_batches')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Failed to delete preorder batch:', error)
    throw new Error(error.message || 'Failed to delete preorder batch')
  }

  revalidatePath(`/admin/preorder-groups/${groupId}`)
}

// Product Preorder Assignment
const productPreorderSchema = z.object({
  product_id: z.string().uuid(),
  preorder_group_id: z.string().uuid().nullable(),
  pickup_only_override: z.boolean().nullable(),
})

export async function assignProductToPreorderGroup(formData: FormData) {
  const productId = formData.get('product_id') as string
  const preorderGroupId = formData.get('preorder_group_id') as string | null
  const supabase = await createClient()

  if (!preorderGroupId) {
    const { error } = await supabase
      .from('product_preorder_groups')
      .delete()
      .eq('product_id', productId)

    if (error) {
      console.error('Failed to remove preorder group assignment:', error)
      throw new Error(error.message || 'Failed to remove preorder group assignment')
    }
  } else {
    const { error } = await supabase
      .from('product_preorder_groups')
      .upsert({
        product_id: productId,
        preorder_group_id: preorderGroupId,
        pickup_only_override: null,
      })

    if (error) {
      console.error('Failed to assign preorder group:', error)
      throw new Error(error.message || 'Failed to assign preorder group')
    }
  }

  revalidatePath(`/admin/products/${productId}/edit`)
}

export async function updateProductPickupOnly(formData: FormData) {
  const productId = formData.get('product_id') as string
  const pickupOnly = formData.get('pickup_only') === 'true'
  const supabase = await createClient()

  const { error } = await supabase
    .from('products')
    .update({ pickup_only: pickupOnly })
    .eq('id', productId)

  if (error) {
    console.error('Failed to update product pickup_only:', error)
    throw new Error(error.message || 'Failed to update product')
  }

  revalidatePath(`/admin/products/${productId}/edit`)
  revalidatePath(`/admin/products`)
}

// Fetch functions for use in server components
export async function getPreorderGroups() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('preorder_groups')
    .select('*')
    .order('name')

  if (error) {
    console.error('Failed to fetch preorder groups:', error)
    return []
  }

  return data
}

export async function getPreorderGroup(id: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('preorder_groups')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Failed to fetch preorder group:', error)
    return null
  }

  return data
}

export async function getPreorderBatches(groupId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('preorder_batches')
    .select('*')
    .eq('preorder_group_id', groupId)
    .eq('is_active', true)
    .order('arrival_date')

  if (error) {
    console.error('Failed to fetch preorder batches:', error)
    return []
  }

  return data
}

export async function getProductPreorderAssignment(productId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('product_preorder_groups')
    .select('*')
    .eq('product_id', productId)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to fetch product preorder assignment:', error)
    return null
  }

  return data
}
