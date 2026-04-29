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
    <div
      data-ui-surface="admin"
      className="fixed inset-0 flex min-h-screen overflow-hidden bg-[var(--surface-admin-bg)] text-zinc-950 selection:bg-primary selection:text-white"
    >
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
      <main
        id="main-content"
        className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--surface-admin-bg)] p-4 pb-0 md:p-8 md:pb-0"
      >
        <div className="max-w-[1600px] w-full mx-auto min-h-full flex flex-col">
          {children}
        </div>
      </main>
    </div>
  )
}
