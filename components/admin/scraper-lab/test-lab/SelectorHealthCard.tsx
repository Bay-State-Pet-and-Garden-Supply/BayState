/**
 * Selector Health Card
 *
 * Displays selector validation results in real-time.
 * Shows which selectors are working, missing, or have errors.
 */

'use client';

import { useMemo } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    CheckCircle2,
    XCircle,
    AlertCircle,
    HelpCircle,
    ListOrdered,
} from 'lucide-react';

interface SelectorEvent {
    selector_name: string;
    selector_value: string;
    status: 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED';
    duration_ms?: number;
    error_message?: string;
    timestamp: string;
}

interface SelectorHealthCardProps {
    scraperName: string;
    sku: string;
    selectorEvents: SelectorEvent[];
    className?: string;
}

export function SelectorHealthCard({
    scraperName,
    sku,
    selectorEvents,
    className,
}: SelectorHealthCardProps) {
    const stats = useMemo(() => {
        const total = selectorEvents.length;
        const found = selectorEvents.filter((e) => e.status === 'FOUND').length;
        const missing = selectorEvents.filter((e) => e.status === 'MISSING').length;
        const error = selectorEvents.filter((e) => e.status === 'ERROR').length;
        const skipped = selectorEvents.filter((e) => e.status === 'SKIPPED').length;

        const healthScore = total > 0 ? Math.round((found / total) * 100) : 0;

        return { total, found, missing, error, skipped, healthScore };
    }, [selectorEvents]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'FOUND':
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'MISSING':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'ERROR':
                return <AlertCircle className="h-4 w-4 text-orange-500" />;
            case 'SKIPPED':
                return <HelpCircle className="h-4 w-4 text-gray-400" />;
            default:
                return <HelpCircle className="h-4 w-4 text-gray-400" />;
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
            FOUND: 'default',
            MISSING: 'destructive',
            ERROR: 'destructive',
            SKIPPED: 'secondary',
        };
        return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
    };

    const getHealthColor = (score: number) => {
        if (score >= 90) return 'text-green-600';
        if (score >= 70) return 'text-yellow-600';
        return 'text-red-600';
    };

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ListOrdered className="h-5 w-5" />
                        <CardTitle>Selector Health</CardTitle>
                    </div>
                    <div className={`text-2xl font-bold ${getHealthColor(stats.healthScore)}`}>
                        {stats.healthScore}%
                    </div>
                </div>
                <CardDescription>
                    {scraperName} / SKU: {sku}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Progress bar */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>Selector Success Rate</span>
                        <span className="text-muted-foreground">
                            {stats.found}/{stats.total} found
                        </span>
                    </div>
                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${stats.healthScore}%` }}
                        />
                    </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-lg bg-green-50 p-2 text-center">
                        <div className="text-lg font-bold text-green-700">{stats.found}</div>
                        <div className="text-xs text-green-600">Found</div>
                    </div>
                    <div className="rounded-lg bg-red-50 p-2 text-center">
                        <div className="text-lg font-bold text-red-700">{stats.missing}</div>
                        <div className="text-xs text-red-600">Missing</div>
                    </div>
                    <div className="rounded-lg bg-orange-50 p-2 text-center">
                        <div className="text-lg font-bold text-orange-700">{stats.error}</div>
                        <div className="text-xs text-orange-600">Error</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-2 text-center">
                        <div className="text-lg font-bold text-gray-700">{stats.skipped}</div>
                        <div className="text-xs text-gray-600">Skipped</div>
                    </div>
                </div>

                {/* Selector list */}
                {selectorEvents.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">Selector Details</h4>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                            {selectorEvents.map((event, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm"
                                >
                                    <div className="flex items-center gap-2">
                                        {getStatusIcon(event.status)}
                                        <span className="font-mono">{event.selector_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {event.duration_ms && (
                                            <span className="text-xs text-muted-foreground">
                                                {event.duration_ms}ms
                                            </span>
                                        )}
                                        {getStatusBadge(event.status)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {selectorEvents.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                        No selector validation events yet
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
