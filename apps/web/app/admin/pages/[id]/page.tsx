import PageForm from '../_components/page-form'
import { getPage } from '../actions'
import { notFound } from 'next/navigation'
import { AdminPageShell } from '@/components/admin/admin-page-shell'

export default async function EditPage({ params }: { params: { id: string } }) {
  const page = await getPage(params.id)
  
  if (!page) {
    notFound()
  }

  return (
    <AdminPageShell title={`Edit Page: ${page.title}`}>
      <PageForm page={page} />
    </AdminPageShell>
  )
}
