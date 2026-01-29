/**
 * Test Summary Dashboard
 *
 * Aggregates all test results into a summary view.
 * Shows overall health, counts, and key metrics.
 */

'use client';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Beaker,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Clock,
    Zap,
} from 'lucide-react';

interface TestSummary {
    testRunId: string;
    scraperName: string;
    status: 'running' | 'completed' | 'failed' | 'pending';
    startedAt: string;
    completedAt?: string;
    durationMs?: number;

    // Selector stats
    selectorTotal: number;
    selectorSuccess: number;
    selectorFailed: number;

    // Login stats
    loginStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'ERROR';

    // Extraction stats
    extractionTotal: number;
    extractionSuccess: number;
    extractionFailed: number;

    // Overall
    healthScore: number;
}

interface TestSummaryDashboardProps {
    summary: TestSummary;
    className?: string;
}

export function TestSummaryDashboard({
    summary,
    className,
}: TestSummaryDashboardProps) {
    const getStatusBadge = () => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
            running: 'secondary',
            completed: 'default',
            failed: 'destructive',
            pending: 'secondary',
        };
        const labels: Record<string, string> = {
            running: 'Running',
            completed: 'Completed',
            failed: 'Failed',
            pending: 'Pending',
        };
        return (
            <Badge variant={variants[summary.status] || 'secondary'}>
                {labels[summary.status] || summary.status}
            </Badge>
        );
    };

    const getHealthColor = () => {
        if (summary.healthScore >= 90) return 'text-green-600';
        if (summary.healthScore >= 70) return 'text-yellow-600';
        return 'text-red-600';
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return '-';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${remainingSeconds}s`;
    };

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Beaker className="h-5 w-5" />
                        <CardTitle>Test Summary</CardTitle>
                    </div>
                    {getStatusBadge()}
                </div>
                <CardDescription>
                    {summary.scraperName} / Run ID: {summary.testRunId}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Health Score */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Overall Health</span>
                        <span className={`text-2xl font-bold ${getHealthColor()}`}>
                            {summary.healthScore}%
                        </span>
                    </div>
                    <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${summary.healthScore}%` }}
                        />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Selectors */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span>Selectors</span>
                        </div>
                        <div className="text-2xl font-bold">
                            {summary.selectorSuccess}/{summary.selectorTotal}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {summary.selectorFailed} failed
                        </div>
                    </div>

                    {/* Login */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Zap className="h-4 w-4 text-blue-500" />
                            <span>Login</span>
                        </div>
                        <div className="text-2xl font-bold">
                            {summary.loginStatus || 'Pending'}
                        </div>
                        <div className="text-xs text-muted-foreground">Login status</div>
                    </div>

                    {/* Extraction */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="h-4 w-4 text-purple-500" />
                            <span>Extraction</span>
                        </div>
                        <div className="text-2xl font-bold">
                            {summary.extractionSuccess}/{summary.extractionTotal}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {summary.extractionFailed} failed
                        </div>
                    </div>

                    {/* Duration */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <span>Duration</span>
                        </div>
                        <div className="text-2xl font-bold">
                            {formatDuration(summary.durationMs)}
                        </div>
                        <div className="text-xs text-muted-foreground">Total time</div>
                    </div>
                </div>

                {/* Timing */}
                <div className="flex justify-between text-sm text-muted-foreground pt-4 border-t">
                    <span>
                        Started: {new Date(summary.startedAt).toLocaleTimeString()}
                    </span>
                    {summary.completedAt && (
                        <span>
                            Completed: {new Date(summary.completedAt).toLocaleTimeString()}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
