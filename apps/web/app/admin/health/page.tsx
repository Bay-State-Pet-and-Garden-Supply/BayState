import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { DataHealth } from '@/components/admin/health/data-health';
import type { IntegrationSyncRun } from '@/lib/orders';

export default async function DataHealthPage() {
    const supabase = await createClient();

    // Latest ShopSite sync run
    const { data: shopSiteSync } = await supabase
        .from('integration_sync_runs')
        .select('*')
        .eq('source_type', 'shopsite')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    // Latest Integra sync run
    const { data: integraSync } = await supabase
        .from('integration_sync_runs')
        .select('*')
        .eq('source_type', 'integra')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    // Failed syncs in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: failedSyncs } = await supabase
        .from('integration_sync_runs')
        .select('*')
        .in('status', ['failed', 'partial'])
        .gte('started_at', thirtyDaysAgo)
        .order('started_at', { ascending: false })
        .limit(10);

    return (
        <AdminPageShell title="Data Health">
            <DataHealth
                shopSiteSync={shopSiteSync as IntegrationSyncRun | null}
                integraSync={integraSync as IntegrationSyncRun | null}
                failedSyncs={(failedSyncs || []) as IntegrationSyncRun[]}
            />
        </AdminPageShell>
    );
}
