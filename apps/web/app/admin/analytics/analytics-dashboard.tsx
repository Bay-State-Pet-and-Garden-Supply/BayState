'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SalesMetric {
    total_revenue: number;
    total_orders: number;
    average_order_value: number;
    total_tax: number;
}

interface TrendData {
    period_date: string;
    revenue: number;
    orders: number;
}

interface AnalyticsDashboardProps {
    metrics: SalesMetric;
    trends: TrendData[];
    activeSource: string | null;
}

export function AnalyticsDashboard({ 
    metrics, 
    trends,
    activeSource
}: AnalyticsDashboardProps) {
    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    const channels = [
        { label: 'All Channels', value: null },
        { label: 'Online (ShopSite)', value: 'shopsite' },
        { label: 'In-Store (Integra)', value: 'integra' },
    ];

    return (
        <div className="space-y-8">
            {/* Channel Tabs */}
            <div className="flex flex-wrap gap-4 mb-8">
                {channels.map((channel) => (
                    <Link
                        key={channel.label}
                        href={channel.value ? `/admin/analytics?source=${channel.value}` : '/admin/analytics'}
                        className={cn(
                            "px-6 py-3 font-display font-black uppercase tracking-tighter text-lg border-4 transition-all",
                            activeSource === channel.value
                                ? "bg-zinc-900 text-white border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,0.3)]"
                                : "bg-white text-zinc-900 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]"
                        )}
                    >
                        {channel.label}
                    </Link>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none bg-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-black text-foreground">
                            {formatCurrency(metrics.total_revenue || 0)}
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none bg-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">Order Volume</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-black text-foreground">
                            {metrics.total_orders || 0}
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none bg-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">Avg Order Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-black text-foreground">
                            {formatCurrency(metrics.average_order_value || 0)}
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none bg-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">Total Tax</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-black text-foreground">
                            {formatCurrency(metrics.total_tax || 0)}
                        </p>
                    </CardContent>
                </Card>
            </div>
            
            <Card className="border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none p-6 bg-white">
                <h2 className="font-display font-black uppercase tracking-tighter text-2xl mb-6">
                    Historical Revenue Trends
                </h2>
                <div className="h-[400px] w-full">
                    {hasMounted ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <AreaChart data={trends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#18181b" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                                <XAxis 
                                    dataKey="period_date" 
                                    tickFormatter={(v) => {
                                        const date = new Date(v);
                                        return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
                                    }}
                                    axisLine={{ stroke: '#18181b', strokeWidth: 2 }}
                                    tick={{ fill: '#71717a', fontSize: 12, fontWeight: 600 }}
                                />
                                <YAxis 
                                    tickFormatter={(v) => `$${v}`}
                                    axisLine={{ stroke: '#18181b', strokeWidth: 2 }}
                                    tick={{ fill: '#71717a', fontSize: 12, fontWeight: 600 }}
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        border: '4px solid #18181b', 
                                        borderRadius: '0px',
                                        boxShadow: '4px 4px 0px rgba(0,0,0,1)',
                                        fontWeight: 'bold'
                                    }}
                                    formatter={(value: number | string | (string | number)[] | undefined) => [formatCurrency(Number(value) || 0), 'Revenue']}
                                    labelFormatter={(label) => {
                                        const date = new Date(label as string);
                                        return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                                    }}
                                />

                                <Area 
                                    type="monotone" 
                                    dataKey="revenue" 
                                    stroke="#18181b" 
                                    fillOpacity={1} 
                                    fill="url(#colorRevenue)" 
                                    strokeWidth={4} 
                                    dot={{ r: 4, fill: '#18181b', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="w-full h-full bg-zinc-50 animate-pulse flex items-center justify-center border-2 border-dashed border-zinc-200">
                            <span className="text-zinc-400 font-bold uppercase text-xs">Loading Chart...</span>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
