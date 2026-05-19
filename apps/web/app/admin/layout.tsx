import { AdminLayoutStyles } from '@/components/admin/AdminLayoutStyles';
import { MobileSidebarDrawer } from '@/components/admin/mobile-sidebar-drawer';
import { AdminSidebar } from '@/components/admin/sidebar';
import { SkipLink } from '@/components/ui/skip-link';
import { generateAdminApiKey } from '@/lib/admin-api-key-auth';
import { createAdminClient, createClient } from '@/lib/supabase/server';

/**
 * Ensures the current admin user has an API key available for client-side calls.
 *
 * Strategy: generate a fresh session-scoped key on each layout load.
 * The key is stored in sessionStorage so it lives for the browser tab session.
 * It has a 24-hour expiry to prevent accumulating stale keys.
 */
async function getSessionApiKey(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role;
    if (!role || (role !== 'admin' && role !== 'staff')) return null;

    const { key, hash, prefix } = generateAdminApiKey();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const adminClient = await createAdminClient();
    const { error: insertError } = await adminClient.from('user_api_keys').insert({
      user_id: user.id,
      key_hash: hash,
      key_prefix: prefix,
      description: 'Auto-generated admin UI session key (24h expiry)',
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    });

    if (insertError) {
      console.error('[Admin Layout] Failed to insert session API key:', insertError);
      return null;
    }

    return key;
  } catch (error) {
    console.error('[Admin Layout] Failed to get session API key:', error);
    return null;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth is currently bypassed for development.
  const role = 'staff';
  const apiKey = await getSessionApiKey();

  return (
    <div
      data-ui-surface="admin"
      className="fixed inset-0 flex min-h-screen overflow-hidden bg-[var(--surface-admin-bg)] text-foreground selection:bg-primary selection:text-white"
    >
      <AdminLayoutStyles />
      <SkipLink />

      <div className="hidden md:flex">
        <AdminSidebar userRole={role as 'admin' | 'staff'} />
      </div>

      <MobileSidebarDrawer>
        <AdminSidebar userRole={role as 'admin' | 'staff'} forceExpanded />
      </MobileSidebarDrawer>

      <main
        id="main-content"
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-admin-bg)]"
      >
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-16 md:px-6 md:pb-6 md:pt-6 xl:px-8">
          <div className="mx-auto flex min-h-0 w-full max-w-[1760px] flex-1 flex-col">
            {children}
          </div>
        </div>
      </main>

      {apiKey ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{sessionStorage.setItem('bs_admin_api_key',${JSON.stringify(apiKey)})}catch(e){}})();`,
          }}
        />
      ) : null}
    </div>
  );
}
