import { FilePenLine } from 'lucide-react';
import { notFound } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getPage } from '../actions';
import PageForm from '../_components/page-form';

export default async function EditPage({ params }: { params: { id: string } }) {
  const page = await getPage(params.id);

  if (!page) {
    notFound();
  }

  return (
    <AdminPageShell
      title={`Edit: ${page.title}`}
      description="Update copy, publishing state, and storefront content for this page."
      icon={<FilePenLine className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/pages"
      backLabel="Back to pages"
    >
      <PageForm page={page} />
    </AdminPageShell>
  );
}
