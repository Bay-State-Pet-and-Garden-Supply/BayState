'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Page } from '@/lib/types'

export async function getPages(): Promise<Page[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching pages:', error)
    return []
  }

  return data
}

export async function getPage(id: string): Promise<Page | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching page:', error)
    return null
  }

  return data
}

export async function createPage(formData: FormData) {
  const supabase = await createClient()
  
  const title = formData.get('title') as string
  const slug = formData.get('slug') as string
  const content = formData.get('content') as string
  const is_published = formData.get('is_published') === 'on'
  const meta_title = formData.get('meta_title') as string
  const meta_description = formData.get('meta_description') as string

  const { error } = await supabase
    .from('pages')
    .insert({
      title,
      slug,
      content,
      is_published,
      meta_title,
      meta_description,
    })

  if (error) {
    console.error('Error creating page:', error)
    return { error: 'Failed to create page' }
  }

  revalidatePath('/admin/pages')
  redirect('/admin/pages')
}

export async function updatePage(id: string, formData: FormData) {
  const supabase = await createClient()
  
  const title = formData.get('title') as string
  const slug = formData.get('slug') as string
  const content = formData.get('content') as string
  const is_published = formData.get('is_published') === 'on'
  const meta_title = formData.get('meta_title') as string
  const meta_description = formData.get('meta_description') as string

  const { error } = await supabase
    .from('pages')
    .update({
      title,
      slug,
      content,
      is_published,
      meta_title,
      meta_description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating page:', error)
    return { error: 'Failed to update page' }
  }

  revalidatePath('/admin/pages')
  revalidatePath(`/admin/pages/${id}`)
  revalidatePath(`/${slug}`) // Revalidate public page
  redirect('/admin/pages')
}

export async function deletePage(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('pages').delete().eq('id', id)

  if (error) {
    console.error('Error deleting page:', error)
    return { error: 'Failed to delete page' }
  }

  revalidatePath('/admin/pages')
}

export async function getPageBySlug(slug: string): Promise<Page | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (error) {
    return null
  }

  return data
}
