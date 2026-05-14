import { AdminSidebar } from '@/components/admin/sidebar'
import { MobileSidebarDrawer } from '@/components/admin/mobile-sidebar-drawer'
import { SkipLink } from '@/components/ui/skip-link'
import { AdminLayoutStyles } from '@/components/admin/AdminLayoutStyles'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateAdminApiKey } from '@/lib/admin-api-key-auth'
import { cookies } from 'next/headers'
import crypto from 'crypto'

/**
 * Ensures the current admin user has an API key available for client-side calls.
 *
 * Strategy: generate a fresh session-scoped key on each layout load.
 * The key is stored in sessionStorage so it lives for the browser tab session.
 * It has a 24-hour expiry to prevent accumulating stale keys.
 *
 * This avoids the chicken-and-egg problem: the admin layout has SSR cookie auth,
 * so it can call createAdminClient() to insert the key. The client then uses
 * the key for all subsequent fetch() calls to admin API routes.
 */
async function getSessionApiKey(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    // Verify admin/staff role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role
    if (!role || (role !== 'admin' && role !== 'staff')) return null

    // Generate a fresh session key (24h expiry)
    const { key, hash, prefix } = generateAdminApiKey()

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const adminClient = await createAdminClient()
    const { error: insertError } = await adminClient
      .from('user_api_keys')
      .insert({
        user_id: user.id,
        key_hash: hash,
        key_prefix: prefix,
        description: 'Auto-generated admin UI session key (24h expiry)',
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      })

    if (insertError) {
      console.error('[Admin Layout] Failed to insert session API key:', insertError)
      return null
    }

    return key
  } catch (error) {
    console.error('[Admin Layout] Failed to get session API key:', error)
    return null
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth is currently bypassed for development
  const role = 'admin'

  // Bootstrap an API key for client-side adminFetch() calls
  const apiKey = await getSessionApiKey()

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

      {/* Inject admin API key into sessionStorage for client-side adminFetch() */}
      {apiKey && (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{sessionStorage.setItem('bs_admin_api_key',${JSON.stringify(apiKey)})}catch(e){}})();`,
          }}
        />
      )}
    </div>
  )
}
