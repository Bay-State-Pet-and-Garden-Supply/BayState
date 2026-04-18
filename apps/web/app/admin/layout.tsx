import { AdminSidebar } from '@/components/admin/sidebar'
import { MobileSidebarDrawer } from '@/components/admin/mobile-sidebar-drawer'
import { SkipLink } from '@/components/ui/skip-link'
import { AdminLayoutStyles } from '@/components/admin/AdminLayoutStyles'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth is currently bypassed for development
  const role = 'admin';

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-zinc-50 text-zinc-950 selection:bg-zinc-950 selection:text-white min-h-screen">
      <AdminLayoutStyles />
      <SkipLink />
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <AdminSidebar userRole={role as 'admin' | 'staff'} />
      </div>
      {/* Mobile drawer */}
      <MobileSidebarDrawer>
        <AdminSidebar userRole={role as 'admin' | 'staff'} />
      </MobileSidebarDrawer>
      <main id="main-content" className="flex-1 min-w-0 h-full flex flex-col overflow-hidden p-4 pb-0 md:p-8 md:pb-0">
        <div className="max-w-[1600px] w-full mx-auto h-full flex flex-col min-h-0 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-200">
          {children}
          <div className="h-10 shrink-0" aria-hidden="true" /> {/* Bottom spacing */}
        </div>
      </main>
    </div>
  )
}
