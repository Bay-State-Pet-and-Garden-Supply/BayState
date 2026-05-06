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
 <div className="space-y-10 pb-8">
 <div className="admin-toolbar flex flex-col gap-4 p-4">
 <span className="text-xs font-semibold tracking-[0.08em] text-zinc-500">Channel view</span>
 <div className="flex flex-wrap gap-2">
 {channels.map((channel) => (
 <Link
 key={channel.label}
 href={channel.value ? `/admin/analytics?source=${channel.value}` : '/admin/analytics'}
 className={cn(
 "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
 activeSource === channel.value
 ? "border-primary bg-primary text-white"
 : "border-border bg-card text-zinc-600 hover:border-zinc-300 hover:text-foreground"
 )}
 >
 {channel.label}
 </Link>
 ))}
 </div>
 </div>

 <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
 <MetricCard title="Total Revenue" value={formatCurrency(metrics.total_revenue || 0)} label="GROSS SALES" />
 <MetricCard title="Order Volume" value={metrics.total_orders || 0} label="UNITS PROCESSED" />
 <MetricCard title="Avg Order" value={formatCurrency(metrics.average_order_value || 0)} label="UNIT VALUE" />
 <MetricCard title="Tax Liability" value={formatCurrency(metrics.total_tax || 0)} label="COMPLIANCE" />
 </div>

 <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
 <div className="xl:col-span-4 space-y-8">
 <InventoryDriftMonitor drift={drift} />
 <SyncHealthTimeline health={syncHealth} />
 </div>

 <div className="xl:col-span-8 space-y-8">
 <div className="admin-panel p-6">
 <div className="mb-6 flex flex-wrap items-center gap-3">
 <h3 className="text-2xl font-semibold text-foreground">
 Revenue Trajectory
 </h3>
 <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-zinc-600">
 {activeSource || 'ALL_CHANNELS'}
 </span>
 </div>
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
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
 <XAxis 
 dataKey="period_date" 
 tickFormatter={(v) => {
 const date = new Date(v);
 return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
 }}
 axisLine={{ stroke: '#d4d4d8', strokeWidth: 1 }}
 tick={{ fill: '#71717a', fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}
 />
 <YAxis 
 tickFormatter={(v) => `$${v/1000}k`}
 axisLine={{ stroke: '#d4d4d8', strokeWidth: 1 }}
 tick={{ fill: '#71717a', fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}
 />
 <Tooltip 
 contentStyle={{ 
 border: '1px solid #d4d4d8', 
 borderRadius: '12px',
 boxShadow: 'var(--shadow-md)',
 fontFamily: 'Inter, sans-serif',
 fontWeight: '600'
 }}
 formatter={(value: number | string | undefined) => [formatCurrency(Number(value) || 0), 'REV']}
 />
 <Area 
 type="stepAfter" 
 dataKey="revenue" 
 stroke="#008850" 
 fillOpacity={0.12} 
 fill="#008850" 
 strokeWidth={2.5} 
 />
 </AreaChart>
 </ResponsiveContainer>
 ) : (
 <div className="h-full w-full animate-pulse rounded-2xl border border-dashed border-border bg-muted" />
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
 <div className="admin-panel group p-6 transition-colors hover:bg-muted/80">
 <span className="text-[11px] font-medium tracking-[0.08em] text-zinc-500 transition-colors group-hover:text-zinc-700">{label}</span>
 <div className="flex flex-col mt-1">
 <span className="text-4xl font-semibold leading-none text-foreground">{value}</span>
 <span className="mt-2 text-sm font-medium text-zinc-500">{title}</span>
 </div>
 </div>
 );
}

function InventoryDriftMonitor({ drift }: { drift: InventoryDrift[] }) {
 const totalChanges = drift.length;
 const stockOuts = drift.filter(d => d.field === 'quantity' && d.after_value === '0');
 
 return (
 <div className="admin-panel overflow-hidden">
 <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
 <h3 className="text-lg font-semibold text-foreground">Inventory drift monitor</h3>
 <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-900">7 day window</span>
 </div>
 <div className="p-4 space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="admin-panel-muted p-4">
 <span className="text-[11px] font-medium text-zinc-500">Total changes</span>
 <div className="text-3xl font-semibold text-foreground">{totalChanges}</div>
 </div>
 <div className={cn(
 "rounded-xl border p-4",
 stockOuts.length > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-muted"
 )}>
 <span className="text-[11px] font-medium opacity-80">Stock outs</span>
 <div className="text-3xl font-semibold">{stockOuts.length}</div>
 </div>
 </div>
 
 <div className="space-y-2">
 <span className="text-[11px] font-medium text-zinc-500">Recent swings</span>
 <div className="space-y-1">
 {drift.length > 0 ? drift.slice(0, 5).map((item, i) => (
 <div key={i} className="flex justify-between border-b border-zinc-100 pb-2 text-xs">
 <span className="w-32 truncate font-medium text-foreground">{item.name}</span>
 <span className="text-zinc-400">{item.field}:</span>
 <span className="font-medium text-zinc-700">{item.before_value} → {item.after_value}</span>
 </div>
 )) : (
 <div className="py-2 text-xs text-zinc-400">No recent changes</div>
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
 <div className="admin-panel p-6">
 <h3 className="mb-6 text-2xl font-semibold text-foreground">Channel split</h3>
 <div className="space-y-6">
 <div className="flex h-12 overflow-hidden rounded-full border border-border bg-muted">
 <div 
 className="flex items-center justify-center border-r border-white bg-primary text-[11px] font-medium text-white"
 style={{ width: `${onlinePct}%` }}
 >
 {onlinePct > 15 && `ONLINE ${onlinePct.toFixed(0)}%`}
 </div>
 <div 
 className="flex items-center justify-center bg-zinc-300 text-[11px] font-medium text-zinc-800"
 style={{ width: `${instorePct}%` }}
 >
 {instorePct > 15 && `IN-STORE ${instorePct.toFixed(0)}%`}
 </div>
 </div>
 
 <div className="grid grid-cols-2 gap-8">
 <div>
 <span className="text-[11px] font-medium text-zinc-500">Online AOV</span>
 <div className="text-2xl font-semibold text-foreground">{formatCurrency(channelMetrics.online.average_order_value)}</div>
 </div>
 <div>
 <span className="text-[11px] font-medium text-zinc-500">In-store AOV</span>
 <div className="text-2xl font-semibold text-foreground">{formatCurrency(channelMetrics.instore.average_order_value)}</div>
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
 <div className="admin-panel overflow-hidden">
 <div className="flex items-center justify-between border-b border-border bg-muted p-3">
 <h3 className="text-lg font-semibold text-foreground">Sync health timeline</h3>
 <Button 
 onClick={triggerSync}
 className="h-8 border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
 >
 Trigger Sync
 </Button>
 </div>
 <div className="p-4 space-y-4">
 <div className="flex justify-between items-end">
 <div>
 <span className="text-[11px] font-medium text-zinc-500">Last sync</span>
 <div className="w-32 truncate text-xl font-semibold text-foreground">{lastSync?.sync_type || 'None'}</div>
 </div>
 <div className="text-right">
 <span className="text-[11px] font-medium text-zinc-500">Days since</span>
 <div className="text-3xl font-semibold text-foreground">{daysSinceLastSync}</div>
 </div>
 </div>

 <div className="flex h-8 gap-1">
 {health.length > 0 ? health.slice(0, 30).reverse().map((h, i) => (
 <div 
 key={i} 
 className={cn(
 "flex-1 rounded-sm border border-border",
 h.status === 'completed' ? "bg-green-500" : "bg-red-500"
 )}
 title={`${h.sync_type}: ${h.status} (${new Date(h.started_at).toLocaleDateString()})`}
 />
 )) : (
 <div className="flex-1 rounded-sm border border-dashed border-zinc-300 bg-muted" />
 )}
 </div>

 <div className="space-y-1 max-h-32 overflow-y-auto">
 {health.filter(h => h.status === 'failed').slice(0, 3).map((h, i) => (
 <div key={i} className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs">
 <div className="font-semibold text-red-700">Failed: {h.sync_type}</div>
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
 <div className="admin-panel overflow-hidden">
 <div className="border-b border-border bg-muted p-3">
 <h3 className="text-lg font-semibold text-foreground">Stock aging & velocity</h3>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-zinc-200">
 <div className="p-4 space-y-4">
 <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-[11px] font-medium text-green-700">Fast movers</span>
 <div className="space-y-2">
 {fastMovers.length > 0 ? fastMovers.map((p) => (
 <div key={p.sku} className="flex justify-between items-center border-b border-zinc-100 pb-1">
 <div className="flex flex-col">
 <span className="w-48 truncate text-sm font-medium text-foreground">{p.name}</span>
 <span className="text-[11px] text-zinc-400">Sold: {p.date_sold ? new Date(p.date_sold).toLocaleDateString() : 'Never'}</span>
 </div>
 <span className="text-sm font-semibold text-foreground">{p.quantity}</span>
 </div>
 )) : (
 <div className="py-2 text-xs text-zinc-400">No data</div>
 )}
 </div>
 </div>
 <div className="border-t border-border p-4 md:border-t-0 md:border-l-0 space-y-4">
 <span className="inline-flex rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-zinc-700">Dead stock</span>
 <div className="space-y-2">
 {deadStock.length > 0 ? deadStock.map((p) => (
 <div key={p.sku} className="flex justify-between items-center border-b border-zinc-100 pb-1">
 <div className="flex flex-col">
 <span className="w-48 truncate text-sm font-medium text-foreground">{p.name}</span>
 <span className="text-[11px] text-zinc-400">Received: {p.date_received ? new Date(p.date_received).toLocaleDateString() : 'N/A'}</span>
 </div>
 <span className="text-sm font-semibold text-red-600">{p.quantity}</span>
 </div>
 )) : (
 <div className="py-2 text-xs text-zinc-400">No data</div>
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
 <div className="admin-panel overflow-hidden">
 <div className="border-b border-border bg-muted p-3">
 <h3 className="text-lg font-semibold text-foreground">Price discrepancy detector</h3>
 </div>
 <div className="p-4">
 {priceChanges.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
 <span className="text-xs font-medium">No discrepancies detected</span>
 </div>
 ) : (
 <div className="space-y-2">
 {priceChanges.map((item, i) => (
 <div key={i} className="flex justify-between items-center border-b border-zinc-100 pb-2 last:border-0">
 <div className="flex flex-col">
 <span className="w-40 truncate text-sm font-medium text-foreground">{item.name}</span>
 <span className="text-[11px] text-zinc-400">{item.sku}</span>
 </div>
 <div className="flex items-center gap-2">
 <span className="text-xs text-zinc-400 line-through">${item.before_value}</span>
 <span className="font-semibold text-green-600">${item.after_value}</span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}
