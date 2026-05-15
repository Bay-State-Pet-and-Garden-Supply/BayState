import { createClient } from '@/lib/supabase/server';
import { AnalyticsDashboard } from './analytics-dashboard';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

export const metadata = {
    title: 'Analytics | Bay State Admin',
};

interface PageProps {
    searchParams: Promise<{
        source?: string;
    }>;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
    const supabase = await createClient();
    const params = await searchParams;
    const source = params.source || null;

    const endDate = new Date().toISOString();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 10); // 10 years for historical ShopSite data

    // 1. Fetch top level metrics
    const { data: metricsData } = await supabase
        .rpc('get_sales_metrics', {
            start_date: startDate.toISOString(),
            end_date: endDate,
            p_source: source
        });

    // Fetch channel comparison data if no source is selected
    let channelMetrics = null;
    if (!source) {
        const { data: online } = await supabase.rpc('get_sales_metrics', {
            start_date: startDate.toISOString(), end_date: endDate, p_source: 'shopsite'
        });
        const { data: instore } = await supabase.rpc('get_sales_metrics', {
            start_date: startDate.toISOString(), end_date: endDate, p_source: 'integra'
        });
        const { data: web } = await supabase.rpc('get_sales_metrics', {
            start_date: startDate.toISOString(), end_date: endDate, p_source: 'web'
        });
        channelMetrics = {
            online: online?.[0] || { total_revenue: 0, average_order_value: 0 },
            instore: instore?.[0] || { total_revenue: 0, average_order_value: 0 },
            web: web?.[0] || { total_revenue: 0, average_order_value: 0 }
        };
    }

    // 2. Fetch trends
    const { data: trendsData } = await supabase
        .rpc('get_sales_trends', {
            start_date: startDate.toISOString(),
            end_date: endDate,
            period: 'month',
            p_source: source
        });

    // 3. Fetch Inventory Drift (Module 1 & 5)
    const { data: driftData } = await supabase
        .rpc('get_inventory_drift', { p_days: 7 });

    // 4. Fetch Sync Health (Module 3)
    const { data: healthData } = await supabase
        .rpc('get_sync_health', { p_days: 30 });

    // 5. Fetch Stock Aging & Velocity (Module 4)
    const { data: fastMovers } = await supabase
        .from('products')
        .select('sku, name, date_sold, quantity')
        .not('date_sold', 'is', null)
        .order('date_sold', { ascending: false })
        .limit(5);

    const { data: deadStock } = await supabase
        .from('products')
        .select('sku, name, date_sold, quantity, date_received')
        .gt('quantity', 0)
        .order('date_sold', { ascending: true, nullsFirst: true })
        .limit(5);

    const metrics = metricsData?.[0] || {
        total_revenue: 0,
        total_orders: 0,
        average_order_value: 0,
        total_tax: 0
    };

    return (
        <AdminPageShell title="Analytics & Reporting">
            <AnalyticsDashboard
                metrics={metrics}
                trends={trendsData || []}
                activeSource={source}
                drift={driftData || []}
                syncHealth={healthData || []}
                fastMovers={fastMovers || []}
                deadStock={deadStock || []}
                channelMetrics={channelMetrics}
            />
        </AdminPageShell>
    );
}
