import { getPages, deletePage } from './actions'
import Link from 'next/link'
import { Plus, Edit, Trash, ExternalLink } from 'lucide-react'

export default async function AdminPagesList() {
  const pages = await getPages()

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black uppercase text-zinc-950">Content Pages</h1>
        <Link 
          href="/admin/pages/new" 
          className="bg-primary text-white px-4 py-2 rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:bg-primary/90 flex items-center gap-2 font-black uppercase text-sm"
        >
          <Plus size={16} />
          Create New Page
        </Link>
      </div>

      <div className="bg-card rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] overflow-hidden border border-zinc-950">
        <table className="w-full">
          <thead className="bg-zinc-950 text-white">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider">Title</th>
              <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-wider">Last Updated</th>
              <th className="px-6 py-3 text-right text-xs font-black uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-zinc-950">
            {pages.map((page) => (
              <tr key={page.id} className="hover:bg-muted/50">
                <td className="px-6 py-4 whitespace-nowrap font-bold text-foreground">{page.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">/{page.slug}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-black uppercase rounded-none border border-zinc-950 ${ page.is_published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800' }`}>
                    {page.is_published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {new Date(page.updated_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                  <Link 
                    href={`/${page.slug}`} 
                    target="_blank"
                    className="text-muted-foreground hover:text-foreground p-2 border border-transparent hover:border-zinc-950"
                    title="View Live"
                  >
                    <ExternalLink size={16} />
                  </Link>
                  <Link 
                    href={`/admin/pages/${page.id}`} 
                    className="text-blue-600 hover:text-blue-900 p-2 border border-transparent hover:border-zinc-950"
                    title="Edit"
                  >
                    <Edit size={16} />
                  </Link>
                  <form action={async () => {
                    'use server'
                    await deletePage(page.id)
                  }}>
                    <button 
                      type="submit" 
                      className="text-red-600 hover:text-red-900 p-2 border border-transparent hover:border-zinc-950"
                      title="Delete"
                    >
                      <Trash size={16} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {pages.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                  No pages found. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

  )
}
