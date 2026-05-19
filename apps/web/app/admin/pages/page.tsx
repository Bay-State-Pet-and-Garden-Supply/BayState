import Link from 'next/link';
import { ExternalLink, FileText, Pencil, Plus, Trash } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { Button } from '@/components/ui/button';
import { getPages, deletePage } from './actions';

export default async function AdminPagesList() {
  const pages = await getPages();

  return (
    <AdminPageShell
      title="Pages"
      description="Manage storefront content pages, draft status, and the last updated state in one list."
      icon={<FileText className="h-5 w-5" />}
      eyebrow="Queue view"
      actions={
        <Button asChild>
          <Link href="/admin/pages/new">
            <Plus className="h-4 w-4" />
            New page
          </Link>
        </Button>
      }
    >
      <div className="overflow-hidden rounded-[1rem] border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium">Slug</th>
                <th className="px-6 py-3 text-left text-xs font-medium">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium">Last updated</th>
                <th className="px-6 py-3 text-right text-xs font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4 font-medium text-foreground">{page.title}</td>
                  <td className="px-6 py-4 text-muted-foreground">/{page.slug}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${page.is_published ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      {page.is_published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(page.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon-sm" asChild>
                        <Link href={`/${page.slug}`} target="_blank" title="View live page">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon-sm" asChild>
                        <Link href={`/admin/pages/${page.id}`} title="Edit page">
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <form
                        action={async () => {
                          'use server';
                          await deletePage(page.id);
                        }}
                      >
                        <Button type="submit" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title="Delete page">
                          <Trash className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {pages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No pages found. Create one to get started.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageShell>
  );
}
