import PageForm from '../_components/page-form'
import { getPage } from '../actions'
import { notFound } from 'next/navigation'

export default async function EditPage({ params }: { params: { id: string } }) {
  const page = await getPage(params.id)
  
  if (!page) {
    notFound()
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-primary mb-8">Edit Page: {page.title}</h1>
      <PageForm page={page} />
    </div>
  )
}
