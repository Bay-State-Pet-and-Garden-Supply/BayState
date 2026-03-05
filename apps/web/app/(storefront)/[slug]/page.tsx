import { getPageBySlug } from '@/app/admin/pages/actions'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { Metadata } from 'next'

// Revalidate every hour
export const revalidate = 3600

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const page = await getPageBySlug(params.slug)
  if (!page) return {}

  return {
    title: page.meta_title || page.title,
    description: page.meta_description,
  }
}

export default async function DynamicPage(props: PageProps) {
  const params = await props.params;
  const page = await getPageBySlug(params.slug)

  if (!page) {
    notFound()
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-4xl font-bold text-primary mb-8">{page.title}</h1>
      <article className="prose prose-stone lg:prose-lg max-w-none dark:prose-invert prose-headings:text-primary prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown>{page.content}</ReactMarkdown>
      </article>
      <div className="mt-12 text-sm text-muted-foreground border-t pt-4">
        Last updated: {new Date(page.updated_at).toLocaleDateString()}
      </div>
    </div>
  )
}
