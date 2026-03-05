'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  price: z.coerce.number().min(0),
  stock_status: z.enum(['in_stock', 'out_of_stock', 'pre_order']),
})

export async function updateProduct(id: string, formData: FormData) {
  const supabase = await createClient()

  const rawData = {
    name: formData.get('name'),
    slug: formData.get('slug'),
    price: formData.get('price'),
    stock_status: formData.get('stock_status'),
  }

  const validatedData = productSchema.parse(rawData)

  const { error } = await supabase
    .from('products')
    .update(validatedData)
    .eq('id', id)

  if (error) {
    throw new Error('Failed to update product')
  }

  revalidatePath('/admin/products')
  redirect('/admin/products')
}
