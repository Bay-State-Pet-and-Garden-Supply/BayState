/**
 * TestProgressPanel Component
 *
 * Displays real-time test run progress with current SKU, progress bar,
 * elapsed time, estimated remaining time, and status badges.
 * Uses TestRunManagerContext for state management.
 */

'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
    Play,
    CheckCircle2,
    XCircle,
    Clock,
    Timer,
    AlertCircle,
    Package,
    Square,
    RotateCcw,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useTestRunManager } from '@/lib/contexts/TestRunManagerContext';

interface TestProgressPanelProps {
    className?: string;
}

export function TestProgressPanel({ className }: TestProgressPanelProps) {
    const { currentRun, testSkus, isLoading } = useTestRunManager();
    const [elapsedMs, setElapsedMs] = useState(0);

    // Calculate elapsed time - updates every second when running
    useEffect(() => {
        if (!currentRun || currentRun.status !== 'running') {
            setElapsedMs(0);
            return;
        }

        const startTime = new Date(currentRun.startedAt).getTime();

        const updateElapsed = () => {
            const now = Date.now();
            setElapsedMs(now - startTime);
        };

        // Update immediately
        updateElapsed();

        // Update every second
        const interval = setInterval(updateElapsed, 1000);

        return () => clearInterval(interval);
    }, [currentRun]);

    // Handle cancel test
    const handleCancel = useCallback(() => {
        toast.info('Test cancellation requested');
        // The actual cancel logic would be handled by the context/provider
        // This is a placeholder for the cancel action
    }, []);

    // Handle reset
    const handleReset = useCallback(() => {
        toast.info('Test progress reset');
        setElapsedMs(0);
    }, []);

    // Format duration as mm:ss or hh:mm:ss
    const formatDuration = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const remainingSeconds = seconds % 60;
        const remainingMinutes = minutes % 60;

        if (hours > 0) {
            return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    // Calculate progress statistics
    const progressStats = useMemo(() => {
        if (!currentRun && testSkus.length === 0) {
            return {
                total: 0,
                completed: 0,
                percentage: 0,
                currentSkuIndex: 0,
                currentSku: null,
                averageDuration: 0,
                estimatedRemaining: 0,
            };
        }

        const skusToUse = currentRun?.skus || testSkus;
        const total = skusToUse.length;
        const completed = skusToUse.filter(
            (s) => s.status === 'success' || s.status === 'error' || s.status === 'no_results'
        ).length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Find current SKU (first pending or running)
        const currentSkuIndex = skusToUse.findIndex(
            (s) => s.status === 'running' || s.status === 'pending'
        );
        const currentSku = currentSkuIndex >= 0 ? skusToUse[currentSkuIndex] : null;

        // Calculate average duration from completed SKUs
        const completedSkus = skusToUse.filter((s) => s.duration_ms && s.duration_ms > 0);
        const averageDuration =
            completedSkus.length > 0
                ? completedSkus.reduce((sum, s) => sum + (s.duration_ms || 0), 0) / completedSkus.length
                : 5000; // Default 5 seconds estimate

        // Estimate remaining time
        const remainingSkus = total - completed;
        const estimatedRemaining = remainingSkus * averageDuration;

        return {
            total,
            completed,
            percentage,
            currentSkuIndex: currentSkuIndex >= 0 ? currentSkuIndex + 1 : completed,
            currentSku,
            averageDuration,
            estimatedRemaining,
        };
    }, [currentRun, testSkus]);

    // Get status badge configuration
    const getStatusBadge = () => {
        if (!currentRun) {
            return (
                <Badge variant="secondary">
                    <Clock className="h-3 w-3 mr-1" />
                    Ready
                </Badge>
            );
        }

        const statusConfig: Record<string, {
            variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning';
            icon: React.ReactNode;
            label: string;
        }> = {
            pending: { variant: 'secondary', icon: <Clock className="h-3 w-3 mr-1" />, label: 'Pending' },
            running: { variant: 'warning', icon: <Play className="h-3 w-3 mr-1" />, label: 'Running' },
            passed: { variant: 'success', icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: 'Passed' },
            failed: { variant: 'destructive', icon: <XCircle className="h-3 w-3 mr-1" />, label: 'Failed' },
            partial: { variant: 'warning', icon: <AlertCircle className="h-3 w-3 mr-1" />, label: 'Partial' },
            cancelled: { variant: 'secondary', icon: <Square className="h-3 w-3 mr-1" />, label: 'Cancelled' },
        };

        const config = statusConfig[currentRun.status] || statusConfig.pending;

        return (
            <Badge variant={config.variant}>
                {config.icon}
                {config.label}
            </Badge>
        );
    };

    // Get progress bar color based on status
    const getProgressColor = (): string => {
        if (!currentRun) return 'bg-slate-400';
        switch (currentRun.status) {
            case 'running':
                return 'bg-blue-500';
            case 'passed':
                return 'bg-emerald-500';
            case 'failed':
                return 'bg-red-500';
            case 'partial':
                return 'bg-amber-500';
            case 'cancelled':
                return 'bg-slate-400';
            default:
                return 'bg-slate-400';
        }
    };

    // Empty state - no test run and no SKUs configured
    if (isLoading) {
        return (
            <Card className={className}>
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                                <Package className="h-5 w-5 text-white" />
                            </div>
                            <CardTitle className="text-lg">Test Progress</CardTitle>
                        </div>
                        <Badge variant="secondary">
                            <div className="h-3 w-3 mr-1.5 rounded-full bg-blue-500 animate-pulse" />
                            Loading...
                        </Badge>
                    </div>
                    <CardDescription>Initializing test progress...</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-2 w-full" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-6 w-20" />
                            </div>
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-6 w-16" />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!currentRun && testSkus.length === 0) {
        return (
            <Card className={className}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                                <Package className="h-5 w-5 text-white" />
                            </div>
                            <CardTitle className="text-lg">Test Progress</CardTitle>
                        </div>
                        {getStatusBadge()}
                    </div>
                    <CardDescription>No active test run</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
                        <Package className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                        <p className="text-sm text-gray-600 font-medium">
                            No test in progress
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            Add SKUs and start a test to see progress here
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                            <Package className="h-5 w-5 text-white" />
                        </div>
                        <CardTitle className="text-lg">Test Progress</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        {currentRun?.status === 'running' && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleCancel}
                                className="h-8"
                            >
                                <Square className="h-4 w-4 mr-1" />
                                Cancel
                            </Button>
                        )}
                        {!currentRun && testSkus.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleReset}
                                className="h-8"
                            >
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Reset
                            </Button>
                        )}
                        {getStatusBadge()}
                    </div>
                </div>
                <CardDescription>
                    {currentRun
                        ? `${currentRun.scraperName} / Run ID: ${currentRun.id}`
                        : `${testSkus.length} SKU${testSkus.length !== 1 ? 's' : ''} ready to test`}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Current SKU Info */}
                {progressStats.total > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                                {currentRun
                                    ? `Testing SKU ${progressStats.currentSkuIndex} of ${progressStats.total}`
                                    : `${progressStats.total} SKU${progressStats.total !== 1 ? 's' : ''} queued`}
                            </span>
                            {progressStats.currentSku && (
                                <span className="text-muted-foreground font-mono text-sm">
                                    {progressStats.currentSku.sku}
                                </span>
                            )}
                        </div>
                        {progressStats.currentSku && progressStats.currentSku.type && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-xs">
                                    {progressStats.currentSku.type}
                                </Badge>
                                {progressStats.currentSku.status === 'running' && (
                                    <span className="text-blue-500 animate-pulse flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                        Processing...
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Progress Bar */}
                {progressStats.total > 0 && (
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Overall Progress</span>
                            <span className="font-semibold">{progressStats.percentage}%</span>
                        </div>
                        <Progress
                            value={progressStats.percentage}
                            className="h-3"
                            indicatorClassName={getProgressColor()}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{progressStats.completed} completed</span>
                            <span>{progressStats.total - progressStats.completed} remaining</span>
                        </div>
                    </div>
                )}

                {/* Time Stats */}
                {currentRun && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        {/* Elapsed Time */}
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <span>Elapsed</span>
                            </div>
                            <div className="text-xl font-bold font-mono">
                                {formatDuration(elapsedMs)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Started {new Date(currentRun.startedAt).toLocaleTimeString()}
                            </div>
                        </div>

                        {/* Estimated Remaining */}
                        {currentRun.status === 'running' && progressStats.estimatedRemaining > 0 && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Timer className="h-4 w-4" />
                                    <span>Est. Remaining</span>
                                </div>
                                <div className="text-xl font-bold font-mono">
                                    {formatDuration(progressStats.estimatedRemaining)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Based on avg {Math.round(progressStats.averageDuration / 1000)}s per SKU
                                </div>
                            </div>
                        )}

                        {/* Completed Time (if finished) */}
                        {currentRun.completedAt && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>Completed</span>
                                </div>
                                <div className="text-sm font-medium">
                                    {new Date(currentRun.completedAt).toLocaleTimeString()}
                                </div>
                            </div>
                        )}

                        {/* Duration (if finished) */}
                        {currentRun.completedAt && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Timer className="h-4 w-4" />
                                    <span>Total Duration</span>
                                </div>
                                <div className="text-sm font-medium font-mono">
                                    {formatDuration(
                                        new Date(currentRun.completedAt).getTime() -
                                        new Date(currentRun.startedAt).getTime()
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Results Summary (if completed) */}
                {currentRun && currentRun.status !== 'running' && currentRun.status !== 'pending' && (
                    <div className="pt-4 border-t">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="space-y-1">
                                <div className="text-2xl font-bold text-emerald-600">
                                    {currentRun.passedCount}
                                </div>
                                <div className="text-xs text-muted-foreground">Passed</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-2xl font-bold text-red-600">
                                    {currentRun.failedCount}
                                </div>
                                <div className="text-xs text-muted-foreground">Failed</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-2xl font-bold">
                                    {progressStats.total - currentRun.passedCount - currentRun.failedCount}
                                </div>
                                <div className="text-xs text-muted-foreground">Other</div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
