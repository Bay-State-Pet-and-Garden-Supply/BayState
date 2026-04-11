import { AdminSidebar } from '@/components/admin/sidebar'
import { MobileSidebarDrawer } from '@/components/admin/mobile-sidebar-drawer'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'
import { SkipLink } from '@/components/ui/skip-link'
import { AdminLayoutStyles } from '@/components/admin/AdminLayoutStyles'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  /*
  if (!user) {
    redirect('/login?next=/admin')
  }

  const role = await getUserRole(user.id)

  // Only admin and staff can access admin panel
  if (role !== 'admin' && role !== 'staff') {
    redirect('/login?error=unauthorized')
  }
  */

  const role = 'admin';

  return (
    <div className="dark fixed inset-0 flex overflow-hidden bg-background text-foreground selection:bg-primary/30">
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
      <main id="main-content" className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden p-2 md:p-4">
        <div className="max-w-[1600px] mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  )
}
