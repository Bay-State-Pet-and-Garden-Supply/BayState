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
      className="fixed inset-0 flex min-h-screen overflow-hidden bg-[var(--surface-admin-bg)] text-foreground selection:bg-primary selection:text-white"
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
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-admin-bg)]"
      >
        <div className="flex-1 flex flex-col min-h-0 px-4 pt-2 pb-0 md:px-8 md:pt-4 md:pb-0">
          <div className="max-w-[1600px] w-full mx-auto flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
