'use client'

import { createPage, updatePage } from '../actions'
import { Page } from '@/lib/types'
import { useState } from 'react'

export default function PageForm({ page }: { page?: Page }) {
  const isEditing = !!page
  const [loading, setLoading] = useState(false)
  
  async function handleSubmit(formData: FormData) {
    setLoading(true)
    if (isEditing) {
      await updatePage(page!.id, formData)
    } else {
      await createPage(formData)
    }
    // No need to set loading false as we redirect
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-4xl bg-card p-6 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-zinc-950">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-black uppercase">Page Title</label>
          <input
            name="title"
            defaultValue={page?.title}
            required
            className="flex h-10 w-full rounded-none border border-zinc-950 bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="e.g., Shipping Policy"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-black uppercase">Slug (URL path)</label>
          <div className="flex items-center">
            <span className="bg-muted px-3 py-2 border border-r-0 border-zinc-950 rounded-none text-sm text-muted-foreground">/</span>
            <input
              name="slug"
              defaultValue={page?.slug}
              required
              className="flex h-10 w-full rounded-none border border-zinc-950 bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="shipping"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-black uppercase">Content (Markdown)</label>
        <textarea
          name="content"
          defaultValue={page?.content}
          required
          rows={20}
          className="flex min-h-[80px] w-full rounded-none border border-zinc-950 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
          placeholder="# Shipping Policy&#10;&#10;We ship to..."
        />
        <p className="text-xs text-muted-foreground">
          Supports Markdown: # Heading, **bold**, *italic*, - list, [link](url)
        </p>
      </div>

      <div className="space-y-4 pt-4 border-t border-zinc-950">
        <h3 className="text-lg font-black uppercase">SEO & Settings</h3>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            name="is_published"
            id="is_published"
            defaultChecked={page?.is_published}
            className="h-4 w-4 rounded-none border border-zinc-950 text-primary focus:ring-primary accent-primary"
          />
          <label htmlFor="is_published" className="text-sm font-black uppercase leading-none peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground">
            Publish Page
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-black uppercase">Meta Title</label>
            <input
              name="meta_title"
              defaultValue={page?.meta_title || ''}
              className="flex h-10 w-full rounded-none border border-zinc-950 bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Shipping Policy - Bay State Pet"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black uppercase">Meta Description</label>
            <textarea
              name="meta_description"
              defaultValue={page?.meta_description || ''}
              rows={3}
              className="flex min-h-[80px] w-full rounded-none border border-zinc-950 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Learn about our shipping rates and policies."
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 py-2 rounded-none inline-flex items-center justify-center whitespace-nowrap text-sm font-black uppercase ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-[2px_2px_0px_rgba(0,0,0,1)] border border-zinc-950"
        >
          {loading ? 'Saving...' : (isEditing ? 'Update Page' : 'Create Page')}
        </button>
      </div>
    </form>

  )
}
