'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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

interface InventoryDrift {
    sku: string;
    name: string;
    field: string;
    before_value: string;
    after_value: string;
    sync_at: string;
}

interface SyncHealth {
    started_at: string;
    sync_type: string;
    status: string;
    processed: number;
    created: number;
    updated: number;
    failed: number;
    duration_ms: number;
}

interface ProductMetric {
    sku: string;
    name: string;
    date_sold: string | null;
    quantity: number;
    date_received?: string | null;
}

interface AnalyticsDashboardProps {
    metrics: SalesMetric;
    trends: TrendData[];
    activeSource: string | null;
    drift: InventoryDrift[];
    syncHealth: SyncHealth[];
    fastMovers: ProductMetric[];
    deadStock: ProductMetric[];
    channelMetrics: {
        online: { total_revenue: number; average_order_value: number };
        instore: { total_revenue: number; average_order_value: number };
    } | null;
}

export function AnalyticsDashboard({ 
    metrics, 
    trends,
    activeSource,
    drift,
    syncHealth,
    fastMovers,
    deadStock,
    channelMetrics
}: AnalyticsDashboardProps) {
    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setHasMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    const channels = [
        { label: 'All Channels', value: null },
        { label: 'Online', value: 'shopsite' },
        { label: 'In-Store', value: 'integra' },
    ];

    return (
        <div className="space-y-12">
            {/* Tactical Channel Switchboard */}
            <div className="flex flex-col space-y-4">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Channel Switchboard</span>
                <div className="flex flex-wrap gap-0 border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] w-fit bg-zinc-900">
                    {channels.map((channel) => (
                        <Link
                            key={channel.label}
                            href={channel.value ? `/admin/analytics?source=${channel.value}` : '/admin/analytics'}
                            className={cn(
                                "px-8 py-4 font-display font-black uppercase tracking-tighter text-xl transition-all border-r-4 last:border-r-0 border-zinc-900",
                                activeSource === channel.value
                                    ? "bg-zinc-100 text-zinc-900"
                                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-100"
                            )}
                        >
                            {channel.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* Top Level Metric Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-4 border-zinc-900 bg-zinc-900">
                <MetricCard title="Total Revenue" value={formatCurrency(metrics.total_revenue || 0)} label="GROSS SALES" />
                <MetricCard title="Order Volume" value={metrics.total_orders || 0} label="UNITS PROCESSED" />
                <MetricCard title="Avg Order" value={formatCurrency(metrics.average_order_value || 0)} label="UNIT VALUE" />
                <MetricCard title="Tax Liability" value={formatCurrency(metrics.total_tax || 0)} label="COMPLIANCE" />
            </div>

            {/* Main Console Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                {/* Left Column: Drift & Health */}
                <div className="xl:col-span-4 space-y-8">
                    <InventoryDriftMonitor drift={drift} />
                    <SyncHealthTimeline health={syncHealth} />
                </div>

                {/* Right Column: Trends & Comparison */}
                <div className="xl:col-span-8 space-y-8">
                    {/* Historical Revenue Trends */}
                    <div className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)] p-6">
                        <h3 className="font-display font-black uppercase tracking-tighter text-2xl mb-6 flex items-center gap-4">
                            Revenue Trajectory
                            <span className="bg-zinc-900 text-white text-[10px] px-2 py-1 font-mono tracking-widest uppercase">
                                {activeSource || 'ALL_CHANNELS'}
                            </span>
                        </h3>
                        <div className="h-[300px] w-full">
                            {hasMounted ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="4" height="4">
                                                <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" 
                                                    style={{ stroke: '#18181b', strokeWidth: 1 }} />
                                            </pattern>
                                        </defs>
                                        <CartesianGrid strokeDasharray="0" vertical={true} stroke="#e4e4e7" />
                                        <XAxis 
                                            dataKey="period_date" 
                                            tickFormatter={(v) => {
                                                const date = new Date(v);
                                                return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
                                            }}
                                            axisLine={{ stroke: '#18181b', strokeWidth: 4 }}
                                            tick={{ fill: '#18181b', fontSize: 10, fontWeight: 800, fontFamily: 'monospace' }}
                                        />
                                        <YAxis 
                                            tickFormatter={(v) => `$${v/1000}k`}
                                            axisLine={{ stroke: '#18181b', strokeWidth: 4 }}
                                            tick={{ fill: '#18181b', fontSize: 10, fontWeight: 800, fontFamily: 'monospace' }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                border: '4px solid #18181b', 
                                                borderRadius: '0px',
                                                boxShadow: '8px 8px 0px rgba(0,0,0,1)',
                                                fontFamily: 'monospace',
                                                fontWeight: 'bold'
                                            }}
                                            formatter={(value: number | string | undefined) => [formatCurrency(Number(value) || 0), 'REV']}
                                        />
                                        <Area 
                                            type="stepAfter" 
                                            dataKey="revenue" 
                                            stroke="#18181b" 
                                            fillOpacity={1} 
                                            fill="url(#diagonalHatch)" 
                                            strokeWidth={4} 
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full bg-zinc-50 animate-pulse border-4 border-dashed border-zinc-200" />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <ChannelComparison activeSource={activeSource} channelMetrics={channelMetrics} />
                        <PriceDiscrepancyDetector drift={drift} />
                    </div>

                    <StockAgingVelocity fastMovers={fastMovers} deadStock={deadStock} />
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, label }: { title: string, value: string | number, label: string }) {
    return (
        <div className="bg-white border-r-4 border-b-4 last:border-r-0 border-zinc-900 p-6 group transition-all hover:bg-zinc-50">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400 group-hover:text-zinc-900 transition-colors">{label}</span>
            <div className="flex flex-col mt-1">
                <span className="text-4xl font-black text-zinc-900 tracking-tighter leading-none">{value}</span>
                <span className="font-display font-bold uppercase text-xs text-zinc-500 mt-2">{title}</span>
            </div>
        </div>
    );
}

function InventoryDriftMonitor({ drift }: { drift: InventoryDrift[] }) {
    const totalChanges = drift.length;
    const stockOuts = drift.filter(d => d.field === 'quantity' && d.after_value === '0');
    
    return (
        <div className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <div className="bg-zinc-900 p-2 border-b-4 border-zinc-900 flex justify-between items-center">
                <h3 className="font-display font-black text-white uppercase tracking-tighter text-lg">Inventory Drift Monitor</h3>
                <span className="bg-yellow-400 text-zinc-900 text-[10px] px-2 py-1 font-mono font-bold">7_DAY_WINDOW</span>
            </div>
            <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="border-4 border-zinc-900 p-4 bg-zinc-50">
                        <span className="font-mono text-[10px] font-bold text-zinc-500 uppercase">Total Changes</span>
                        <div className="text-3xl font-black">{totalChanges}</div>
                    </div>
                    <div className={cn(
                        "border-4 border-zinc-900 p-4",
                        stockOuts.length > 0 ? "bg-red-500 text-white" : "bg-zinc-50"
                    )}>
                        <span className="font-mono text-[10px] font-bold uppercase opacity-70">Stock Outs</span>
                        <div className="text-3xl font-black">{stockOuts.length}</div>
                    </div>
                </div>
                
                <div className="space-y-2">
                    <span className="font-mono text-[10px] font-bold text-zinc-500 uppercase">Recent Swings</span>
                    <div className="space-y-1">
                        {drift.length > 0 ? drift.slice(0, 5).map((item, i) => (
                            <div key={i} className="flex justify-between text-[10px] font-mono border-b border-zinc-100 pb-1">
                                <span className="truncate w-32 font-bold uppercase">{item.name}</span>
                                <span className="text-zinc-400">{item.field}:</span>
                                <span className="font-bold">{item.before_value} → {item.after_value}</span>
                            </div>
                        )) : (
                            <div className="text-[10px] font-mono text-zinc-400 py-2">NO_RECENT_CHANGES</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ChannelComparison({ activeSource, channelMetrics }: { 
    activeSource: string | null, 
    channelMetrics: {
        online: { total_revenue: number; average_order_value: number };
        instore: { total_revenue: number; average_order_value: number };
    } | null 
}) {
    if (!channelMetrics || activeSource) return null;
    
    const total = channelMetrics.online.total_revenue + channelMetrics.instore.total_revenue;
    const onlinePct = total > 0 ? (channelMetrics.online.total_revenue / total) * 100 : 0;
    const instorePct = total > 0 ? (channelMetrics.instore.total_revenue / total) * 100 : 0;

    return (
        <div className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)] p-6">
            <h3 className="font-display font-black uppercase tracking-tighter text-2xl mb-6">Channel Split</h3>
            <div className="space-y-6">
                <div className="flex h-12 border-4 border-zinc-900 overflow-hidden bg-zinc-100">
                    <div 
                        className="bg-zinc-900 flex items-center justify-center text-white font-black text-[10px] border-r-2 border-white"
                        style={{ width: `${onlinePct}%` }}
                    >
                        {onlinePct > 15 && `ONLINE ${onlinePct.toFixed(0)}%`}
                    </div>
                    <div 
                        className="bg-zinc-400 flex items-center justify-center text-zinc-900 font-black text-[10px]"
                        style={{ width: `${instorePct}%` }}
                    >
                        {instorePct > 15 && `IN-STORE ${instorePct.toFixed(0)}%`}
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-8">
                    <div>
                        <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase">Online AOV</span>
                        <div className="text-2xl font-black">{formatCurrency(channelMetrics.online.average_order_value)}</div>
                    </div>
                    <div>
                        <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase">In-Store AOV</span>
                        <div className="text-2xl font-black">{formatCurrency(channelMetrics.instore.average_order_value)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SyncHealthTimeline({ health }: { health: SyncHealth[] }) {
    const lastSync = health[0];
    const daysSinceLastSync = lastSync 
        ? Math.floor((new Date().getTime() - new Date(lastSync.started_at).getTime()) / (1000 * 60 * 60 * 24))
        : 'N/A';

    const triggerSync = async () => {
        try {
            const res = await fetch('/api/sync/trigger', { method: 'POST' });
            if (res.ok) {
                toast.success('Sync triggered successfully');
            } else {
                toast.error('Failed to trigger sync');
            }
        } catch (_err) {
            toast.error('Error triggering sync');
        }
    };

    return (
        <div className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <div className="bg-zinc-900 p-2 border-b-4 border-zinc-900 flex justify-between items-center">
                <h3 className="font-display font-black text-white uppercase tracking-tighter text-lg">Sync Health Timeline</h3>
                <Button 
                    onClick={triggerSync}
                    className="bg-white text-zinc-900 hover:bg-zinc-200 font-display font-black uppercase text-[10px] h-6 px-2 rounded-none border-2 border-zinc-900"
                >
                    Trigger Sync
                </Button>
            </div>
            <div className="p-4 space-y-4">
                <div className="flex justify-between items-end">
                    <div>
                        <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase">Last Sync</span>
                        <div className="text-xl font-black uppercase truncate w-32">{lastSync?.sync_type || 'NONE'}</div>
                    </div>
                    <div className="text-right">
                        <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase">Days Since</span>
                        <div className="text-3xl font-black">{daysSinceLastSync}</div>
                    </div>
                </div>

                <div className="flex gap-1 h-8">
                    {health.length > 0 ? health.slice(0, 30).reverse().map((h, i) => (
                        <div 
                            key={i} 
                            className={cn(
                                "flex-1 border border-zinc-900",
                                h.status === 'completed' ? "bg-green-500" : "bg-red-500"
                            )}
                            title={`${h.sync_type}: ${h.status} (${new Date(h.started_at).toLocaleDateString()})`}
                        />
                    )) : (
                        <div className="flex-1 bg-zinc-100 border border-dashed border-zinc-300" />
                    )}
                </div>

                <div className="space-y-1 max-h-32 overflow-y-auto">
                    {health.filter(h => h.status === 'failed').slice(0, 3).map((h, i) => (
                        <div key={i} className="bg-red-50 p-2 border-l-4 border-red-500 text-[10px] font-mono">
                            <div className="font-bold uppercase">FAILED: {h.sync_type}</div>
                            <div className="text-zinc-500">{new Date(h.started_at).toLocaleString()}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StockAgingVelocity({ fastMovers, deadStock }: { fastMovers: ProductMetric[], deadStock: ProductMetric[] }) {
    return (
        <div className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <div className="bg-zinc-900 p-2 border-b-4 border-zinc-900">
                <h3 className="font-display font-black text-white uppercase tracking-tighter text-lg">Stock Aging & Velocity</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 divide-x-0 md:divide-x-4 divide-zinc-900">
                <div className="p-4 space-y-4">
                    <span className="bg-green-500 text-white text-[10px] px-2 py-1 font-mono font-bold uppercase">Fast Movers (Recent Sales)</span>
                    <div className="space-y-2">
                        {fastMovers.length > 0 ? fastMovers.map((p) => (
                            <div key={p.sku} className="flex justify-between items-center border-b border-zinc-100 pb-1">
                                <div className="flex flex-col">
                                    <span className="font-display font-black uppercase text-xs truncate w-48">{p.name}</span>
                                    <span className="font-mono text-[10px] text-zinc-400">SOLD: {p.date_sold ? new Date(p.date_sold).toLocaleDateString() : 'NEVER'}</span>
                                </div>
                                <span className="font-mono font-black text-sm">{p.quantity}</span>
                            </div>
                        )) : (
                            <div className="text-[10px] font-mono text-zinc-400 py-2">NO_DATA</div>
                        )}
                    </div>
                </div>
                <div className="p-4 space-y-4 border-t-4 md:border-t-0 border-zinc-900">
                    <span className="bg-zinc-900 text-white text-[10px] px-2 py-1 font-mono font-bold uppercase">Dead Stock (Oldest Sales)</span>
                    <div className="space-y-2">
                        {deadStock.length > 0 ? deadStock.map((p) => (
                            <div key={p.sku} className="flex justify-between items-center border-b border-zinc-100 pb-1">
                                <div className="flex flex-col">
                                    <span className="font-display font-black uppercase text-xs truncate w-48">{p.name}</span>
                                    <span className="font-mono text-[10px] text-zinc-400">RCVD: {p.date_received ? new Date(p.date_received).toLocaleDateString() : 'N/A'}</span>
                                </div>
                                <span className="font-mono font-black text-sm text-red-600">{p.quantity}</span>
                            </div>
                        )) : (
                            <div className="text-[10px] font-mono text-zinc-400 py-2">NO_DATA</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PriceDiscrepancyDetector({ drift }: { drift: InventoryDrift[] }) {
    const priceChanges = drift.filter(d => d.field === 'price' || d.field === 'sale_price');
    
    return (
        <div className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <div className="bg-zinc-900 p-2 border-b-4 border-zinc-900">
                <h3 className="font-display font-black text-white uppercase tracking-tighter text-lg">Price Discrepancy Detector</h3>
            </div>
            <div className="p-4">
                {priceChanges.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
                        <span className="font-mono text-[10px] font-bold">NO_DISCREPANCIES_DETECTED</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {priceChanges.map((item, i) => (
                            <div key={i} className="flex justify-between items-center border-b border-zinc-100 pb-2 last:border-0">
                                <div className="flex flex-col">
                                    <span className="font-display font-black uppercase text-xs truncate w-40">{item.name}</span>
                                    <span className="font-mono text-[10px] text-zinc-400">{item.sku}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs line-through text-zinc-400">${item.before_value}</span>
                                    <span className="font-mono font-black text-green-600">${item.after_value}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
