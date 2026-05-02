import PageForm from '../_components/page-form'
import { AdminPageShell } from '@/components/admin/admin-page-shell'

export default function NewPage() {
  return (
    <AdminPageShell title="Create New Page">
      <PageForm />
    </AdminPageShell>
  )
}
