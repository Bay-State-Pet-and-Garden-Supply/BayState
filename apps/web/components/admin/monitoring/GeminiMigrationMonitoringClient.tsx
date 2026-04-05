'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Brain,
    DollarSign,
    GitCompareArrows,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import { DataTable, type Column } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ProviderSummary {
    jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    total_cost: number;
    avg_cost_per_job: number;
    total_tokens: number;
}

interface ParallelRunRow {
    id: string;
    subject_key: string;
    status: string;
    primary_provider: string;
    shadow_provider: string;
    sample_percent: number;
    comparison: {
        accuracy?: number;
        completeness?: number;
        taxonomy_correctness?: number;
    };
    created_at: string;
    completed_at: string | null;
}

interface RecentJobRow {
    provider: string;
    status: string;
    estimated_cost: number | null;
    total_tokens: number | null;
    description: string | null;
    created_at: string;
    completed_at: string | null;
}

interface MonitoringPayload {
    rollout: {
        traffic_percent: number;
        parallel_enabled: boolean;
        sample_percent: number;
        batch_enabled: boolean;
        stage: string;
    };
    flags: Record<string, boolean | number>;
    providers: Record<string, ProviderSummary>;
    parallel_runs: {
        total: number;
        completed: number;
        failed: number;
        average_accuracy: number | null;
        average_completeness: number | null;
        average_taxonomy_correctness: number | null;
        recent: ParallelRunRow[];
    };
    estimated_savings_percent: number | null;
    alerts: string[];
    recent_jobs: RecentJobRow[];
}

function formatPercent(value: number | null | undefined): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 'n/a';
    }

    return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '0';
    }

    return new Intl.NumberFormat('en-US').format(value);
}

function formatCurrency(value: number | null | undefined): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(amount);
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'completed') {
        return 'secondary';
    }

    if (status === 'failed' || status === 'expired' || status === 'cancelled') {
        return 'destructive';
    }

    if (status === 'running' || status === 'in_progress' || status === 'pending') {
        return 'outline';
    }

    return 'default';
}

export function GeminiMigrationMonitoringClient() {
    const [data, setData] = useState<MonitoringPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/admin/monitoring/gemini-migration?days=30', {
                cache: 'no-store',
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || 'Failed to load monitoring data');
            }

            setData(payload);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Failed to load monitoring data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const parallelColumns = useMemo<Column<ParallelRunRow>[]>(() => [
        {
            key: 'subject_key',
            header: 'Subject',
            sortable: true,
        },
        {
            key: 'status',
            header: 'Status',
            render: (value) => <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>,
        },
        {
            key: 'primary_provider',
            header: 'Providers',
            render: (_, row) => `${row.primary_provider} -> ${row.shadow_provider}`,
        },
        {
            key: 'comparison.accuracy',
            header: 'Accuracy',
            sortable: true,
            render: (_, row) => formatPercent(row.comparison.accuracy),
        },
        {
            key: 'comparison.completeness',
            header: 'Completeness',
            sortable: true,
            render: (_, row) => formatPercent(row.comparison.completeness),
        },
        {
            key: 'created_at',
            header: 'Created',
            sortable: true,
            render: (value) => new Date(String(value)).toLocaleString(),
        },
    ], []);

    const jobColumns = useMemo<Column<RecentJobRow & { id: string }>[]>(() => [
        {
            key: 'provider',
            header: 'Provider',
            sortable: true,
        },
        {
            key: 'status',
            header: 'Status',
            render: (value) => <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>,
        },
        {
            key: 'estimated_cost',
            header: 'Cost',
            sortable: true,
            render: (value) => formatCurrency(typeof value === 'number' ? value : null),
        },
        {
            key: 'total_tokens',
            header: 'Tokens',
            sortable: true,
            render: (value) => formatNumber(typeof value === 'number' ? value : null),
        },
        {
            key: 'description',
            header: 'Description',
            searchable: true,
            render: (value) => String(value ?? 'Batch job'),
        },
        {
            key: 'created_at',
            header: 'Created',
            sortable: true,
            render: (value) => new Date(String(value)).toLocaleString(),
        },
    ], []);

    if (loading && !data) {
        return (
            <div className="flex min-h-[320px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
                <p className="text-sm font-medium text-destructive">{error}</p>
                <Button className="mt-4" onClick={() => void loadData()} variant="outline">
                    Retry
                </Button>
            </div>
        );
    }

    if (!data) {
        return null;
    }

    const recentJobs = data.recent_jobs.map((job, index) => ({
        ...job,
        id: `${job.provider}-${job.created_at}-${index}`,
    }));

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Gemini Migration Monitoring
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Track rollout flags, batch cost trends, and OpenAI versus Gemini shadow-run agreement.
                    </p>
                </div>

                <Button
                    variant="outline"
                    onClick={() => void loadData()}
                    disabled={loading}
                    className="w-full sm:w-auto"
                >
                    {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh
                </Button>
            </div>

            <div className="flex flex-wrap gap-2">
                {Object.entries(data.flags).map(([key, value]) => (
                    <Badge key={key} variant="outline" className="font-mono text-xs">
                        {key}: {String(value)}
                    </Badge>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Gemini Traffic"
                    value={`${data.rollout.traffic_percent}%`}
                    subtitle={`Stage ${data.rollout.stage}`}
                    icon={Brain}
                    variant={data.rollout.traffic_percent > 0 ? 'success' : 'default'}
                />
                <StatCard
                    title="Parallel Accuracy"
                    value={formatPercent(data.parallel_runs.average_accuracy)}
                    subtitle={`${data.parallel_runs.completed} completed comparisons`}
                    icon={GitCompareArrows}
                    variant={
                        data.parallel_runs.average_accuracy !== null && data.parallel_runs.average_accuracy >= 0.9
                            ? 'success'
                            : 'warning'
                    }
                />
                <StatCard
                    title="Gemini Job Cost"
                    value={formatCurrency(data.providers.gemini?.total_cost)}
                    subtitle={`${data.providers.gemini?.jobs ?? 0} jobs in window`}
                    icon={DollarSign}
                    variant="info"
                />
                <StatCard
                    title="Estimated Savings"
                    value={
                        data.estimated_savings_percent === null
                            ? 'n/a'
                            : `${data.estimated_savings_percent.toFixed(1)}%`
                    }
                    subtitle="Gemini vs OpenAI avg cost/job"
                    icon={AlertTriangle}
                    variant={
                        data.estimated_savings_percent !== null && data.estimated_savings_percent >= 0
                            ? 'success'
                            : 'warning'
                    }
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
                    <h2 className="text-lg font-semibold text-foreground">Recent Parallel Runs</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Shadow comparisons are auto-synced during monitoring refresh.
                    </p>
                    <div className="mt-4">
                        <DataTable
                            data={data.parallel_runs.recent}
                            columns={parallelColumns}
                            pageSize={5}
                            pageSizeOptions={[5, 10, 20]}
                            emptyMessage="No parallel runs recorded yet."
                        />
                    </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
                    <h2 className="text-lg font-semibold text-foreground">Alerts</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Rollout warnings derived from flags, completed jobs, and comparison scores.
                    </p>

                    <div className="mt-4 space-y-3">
                        {data.alerts.length === 0 ? (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                                No active Gemini migration alerts.
                            </div>
                        ) : (
                            data.alerts.map((alert) => (
                                <div
                                    key={alert}
                                    className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700"
                                >
                                    {alert}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {Object.entries(data.providers).map(([provider, summary]) => (
                            <div key={provider} className="rounded-lg border border-border bg-background p-4">
                                <p className="text-sm font-medium text-foreground">{provider}</p>
                                <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
                                    <div className="flex items-center justify-between gap-3">
                                        <dt>Jobs</dt>
                                        <dd>{summary.jobs}</dd>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <dt>Completed</dt>
                                        <dd>{summary.completed_jobs}</dd>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <dt>Failed</dt>
                                        <dd>{summary.failed_jobs}</dd>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <dt>Total cost</dt>
                                        <dd>{formatCurrency(summary.total_cost)}</dd>
                                    </div>
                                </dl>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
                <h2 className="text-lg font-semibold text-foreground">Recent Batch Jobs</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Provider-neutral batch history for the last 30 days.
                </p>
                <div className="mt-4">
                    <DataTable
                        data={recentJobs}
                        columns={jobColumns}
                        pageSize={10}
                        pageSizeOptions={[10, 20, 50]}
                        emptyMessage="No batch jobs found for the selected window."
                    />
                </div>
            </section>
        </div>
    );
}
