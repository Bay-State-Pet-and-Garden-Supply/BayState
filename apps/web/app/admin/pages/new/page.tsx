import { FilePlus2 } from 'lucide-react';
import PageForm from '../_components/page-form';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

export default function NewPage() {
  return (
    <AdminPageShell
      title="New content page"
      description="Create a new storefront page, then move into copy, publishing, and layout details below."
      icon={<FilePlus2 className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/pages"
      backLabel="Back to pages"
    >
      <PageForm />
    </AdminPageShell>
  );
}
