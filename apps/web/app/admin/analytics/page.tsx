import { createClient } from '@/utils/supabase/server';
import { AnalyticsDashboard } from './analytics-dashboard';

export const metadata = {
  title: 'Analytics | Bay State Admin',
};

export default async function AnalyticsPage() {
    const supabase = await createClient();
    
    // Set date range to last 30 days
    const endDate = new Date().toISOString();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
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
            period: 'day' 
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
