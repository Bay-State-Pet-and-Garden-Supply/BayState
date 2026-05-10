'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
    HeartPulse, 
    AlertCircle, 
    CheckCircle, 
    Clock, 
    FileText, 
    RefreshCw, 
    ExternalLink,
    Activity,
    Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'sonner';
import type { IntegrationSyncRun } from '@/lib/orders';

interface DataHealthProps {
    shopSiteSync: IntegrationSyncRun | null;
    integraSync: IntegrationSyncRun | null;
    failedSyncs: IntegrationSyncRun[];
}

function relativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Less than an hour ago';
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    return new Date(dateStr).toLocaleDateString();
}

function computeHealth(
    shopSiteSync: IntegrationSyncRun | null,
    integraSync: IntegrationSyncRun | null,
    failedSyncs: IntegrationSyncRun[]
): { status: 'healthy' | 'degraded' | 'down'; label: string } {
    const now = Date.now();
    const integraLast = integraSync ? now - new Date(integraSync.started_at).getTime() : Infinity;
    const shopsiteLast = shopSiteSync ? now - new Date(shopSiteSync.started_at).getTime() : Infinity;

    const integraRecent = integraLast < 24 * 60 * 60 * 1000;
    const shopsiteRecent = shopsiteLast < 7 * 24 * 60 * 60 * 1000;
    const failedCount = failedSyncs.length;

    if (integraRecent && shopsiteRecent && failedCount === 0) {
        return { status: 'healthy', label: 'Healthy' };
    }
    if ((!integraRecent || !shopsiteRecent) && failedCount >= 3) {
        return { status: 'down', label: 'Down' };
    }
    return { status: 'degraded', label: 'Degraded' };
}

const statusConfig = {
    healthy: { color: 'bg-green-100 text-green-800 border-green-300' as const, icon: CheckCircle },
    degraded: { color: 'bg-amber-100 text-amber-800 border-amber-300' as const, icon: AlertCircle },
    down: { color: 'bg-red-100 text-red-800 border-red-300' as const, icon: AlertCircle },
};

const syncRunStatusBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
    completed: { label: 'Completed', variant: 'success' },
    failed: { label: 'Failed', variant: 'destructive' },
    running: { label: 'Running', variant: 'default' },
    partial: { label: 'Partial', variant: 'warning' },
};

function SyncHealthCard({ 
    title, 
    sync, 
    source,
    icon: Icon,
}: { 
    title: string; 
    sync: IntegrationSyncRun | null; 
    source: string;
    icon: React.ElementType;
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="p-2 rounded-full bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    {sync && (
                        <Badge variant={syncRunStatusBadge[sync.status]?.variant ?? 'outline'}>
                            {syncRunStatusBadge[sync.status]?.label ?? sync.status}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {!sync ? (
                    <p className="text-sm text-muted-foreground">No sync runs yet.</p>
                ) : (
                    <>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{relativeTime(sync.started_at)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <span className="text-muted-foreground">Rows</span>
                                <p className="font-medium">{sync.row_count}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Inserted</span>
                                <p className="font-medium">{sync.inserted_count}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Updated</span>
                                <p className="font-medium">{sync.updated_count}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Errors</span>
                                <p className="font-medium text-red-600">{sync.error_count}</p>
                            </div>
                        </div>
                        {sync.file_name && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <FileText className="h-3.5 w-3.5" />
                                <span className="truncate">{sync.file_name}</span>
                            </div>
                        )}
                        {sync.error_summary && (
                            <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
                                {sync.error_summary}
                            </p>
                        )}
                    </>
                )}
                <Button variant="outline" size="sm" asChild className="w-full">
                    <Link href={`/admin/inventory/sync-runs${sync ? `?source=${source}` : ''}`}>
                        View Sync Runs <ExternalLink className="ml-1 h-3 w-3" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}

export function DataHealth({ shopSiteSync, integraSync, failedSyncs }: DataHealthProps) {
    const router = useRouter();
    const [triggering, setTriggering] = useState<string | null>(null);

    async function triggerSync(syncType: string, inputs?: Record<string, string>) {
        setTriggering(syncType);
        try {
            const res = await fetch('/api/sync/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syncType, inputs }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to trigger sync');
            }
            const data = await res.json();
            toast.success('Sync queued', {
                action: { label: 'View run', onClick: () => router.push(`/admin/inventory/sync-runs/${data.syncRunId}`) },
            });
        } catch (err: any) {
            toast.error(err.message || 'Failed to trigger sync');
        } finally {
            setTriggering(null);
        }
    }

    const isTriggering = triggering !== null;

    const health = computeHealth(shopSiteSync, integraSync, failedSyncs);
    const HealthIcon = statusConfig[health.status].icon;

    return (
        <div className="space-y-6">
            {/* Confidence Badge */}
            <Card className={`border-2 ${statusConfig[health.status].color}`}>
                <CardContent className="flex items-center gap-4 py-6">
                    <HealthIcon className="h-10 w-10" />
                    <div>
                        <h2 className="text-xl font-bold">Data Freshness: {health.label}</h2>
                        <p className="text-sm text-muted-foreground">
                            {health.status === 'healthy' && 'All integrations are running smoothly.'}
                            {health.status === 'degraded' && 'Some syncs are stale or have errors.'}
                            {health.status === 'down' && 'One or more integrations need attention.'}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Sync Health Cards */}
            <div className="grid gap-6 md:grid-cols-2">
                <SyncHealthCard
                    title="ShopSite Orders"
                    sync={shopSiteSync}
                    source="shopsite"
                    icon={RefreshCw}
                />
                <SyncHealthCard
                    title="Integra Inventory"
                    sync={integraSync}
                    source="integra"
                    icon={Activity}
                />
            </div>

            {/* Failed Syncs */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        Recent Failures
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {failedSyncs.length === 0 ? (
                        <div className="flex items-center gap-3 py-4">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                            <p className="text-sm text-muted-foreground">No recent failures in the last 30 days.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {failedSyncs.map((sync) => (
                                <div key={sync.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <Badge variant={sync.status === 'failed' ? 'destructive' : 'warning'}>
                                            {sync.status}
                                        </Badge>
                                        <div>
                                            <p className="text-sm font-medium">{sync.source_type}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {relativeTime(sync.started_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {sync.error_summary && (
                                            <p className="text-xs text-red-600 max-w-xs truncate">{sync.error_summary}</p>
                                        )}
                                        <Button variant="link" size="sm" asChild>
                                            <Link href={`/admin/inventory/sync-runs/${sync.id}`}>
                                                View <ExternalLink className="ml-1 h-3 w-3" />
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Trigger Sync</h3>
                <div className="flex flex-wrap gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isTriggering}
                        onClick={() => triggerSync('register_inventory', { apply_changes: 'false', sync_price: 'false' })}
                    >
                        {triggering === 'register_inventory' ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-1 h-3 w-3" />
                        )}
                        Run Register Preview
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isTriggering}
                        onClick={() => triggerSync('shopsite_orders')}
                    >
                        {triggering === 'shopsite_orders' ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-1 h-3 w-3" />
                        )}
                        Run ShopSite Orders
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isTriggering}
                        onClick={() => triggerSync('shopsite_products')}
                    >
                        {triggering === 'shopsite_products' ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-1 h-3 w-3" />
                        )}
                        Run ShopSite Products
                    </Button>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="outline" asChild>
                        <Link href="/admin/inventory/sync-runs">
                            View All Sync Runs
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/admin/tools/integra-sync">
                            Run Integra Sync
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
