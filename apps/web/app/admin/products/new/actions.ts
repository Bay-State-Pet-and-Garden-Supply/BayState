'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import * as z from 'zod'

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  price: z.coerce.number().min(0),
})

export async function createProduct(formData: FormData) {
  const supabase = await createClient()

  const rawData = {
    name: formData.get('name'),
    slug: formData.get('slug'),
    price: formData.get('price'),
  }

  const validatedData = productSchema.parse(rawData)

  const { error } = await supabase.from('products').insert(validatedData)

  if (error) {
    throw new Error('Failed to create product')
  }

  revalidatePath('/admin/products')
  redirect('/admin/products')
}
