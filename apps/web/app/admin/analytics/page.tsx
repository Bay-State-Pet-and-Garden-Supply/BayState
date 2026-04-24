import { createClient } from '@/lib/supabase/server';
import { AnalyticsDashboard } from './analytics-dashboard';

export const metadata = {
  title: 'Analytics | Bay State Admin',
};

export default async function AnalyticsPage() {
    const supabase = await createClient();
    
    // Fetch analytics data. 
    // Since this is a migration phase, we'll look at a wider range (last 10 years) 
    // to ensure historical ShopSite data is visible.
    const endDate = new Date().toISOString();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 10);
    
    // Fetch top level metrics
    const { data: metricsData, error: metricsError } = await supabase
        .rpc('get_sales_metrics', { 
            start_date: startDate.toISOString(), 
            end_date: endDate 
        });

    if (metricsError) {
        console.error('Error fetching metrics:', metricsError);
    }
        
    // Fetch trends
    const { data: trendsData, error: trendsError } = await supabase
        .rpc('get_sales_trends', { 
            start_date: startDate.toISOString(), 
            end_date: endDate, 
            period: 'month' 
        });

    if (trendsError) {
        console.error('Error fetching trends:', trendsError);
    }

    const metrics = metricsData?.[0] || {
        total_revenue: 0,
        total_orders: 0,
        average_order_value: 0,
        total_tax: 0
    };

    return (
        <div className="p-6 space-y-6">
            <h1 className="font-display font-black uppercase tracking-tighter text-4xl mb-8">
                Analytics & Reporting
            </h1>
            <AnalyticsDashboard metrics={metrics} trends={trendsData || []} />
        </div>
    );
}
