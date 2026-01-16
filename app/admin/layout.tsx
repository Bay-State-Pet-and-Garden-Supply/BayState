import { AdminSidebar } from '@/components/admin/sidebar'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'
import { Toaster } from 'sonner'
import { SkipLink } from '@/components/ui/skip-link'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/admin')
  }

  const role = await getUserRole(user.id)

  // Only admin and staff can access admin panel
  if (role !== 'admin' && role !== 'staff') {
    redirect('/login?error=unauthorized')
  }

  return (
    <div className="flex h-screen bg-muted">
      <SkipLink />
      <AdminSidebar userRole={role as 'admin' | 'staff'} />
      <main id="main-content" className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
      <Toaster position="top-right" richColors closeButton />
    </div>
  )
}
