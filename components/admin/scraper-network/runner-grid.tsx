'use client';

import { useEffect, useState } from 'react';
import { Server, Wifi, WifiOff, Loader2 } from 'lucide-react';

interface Runner {
    id: string | number;
    name: string;
    os: string;
    status: 'online' | 'offline';
    busy: boolean;
    labels: Array<{ name: string }>;
}

interface RunnerGridProps {
    initialRunners?: Runner[];
}

export function RunnerGrid({ initialRunners = [] }: RunnerGridProps) {
    const [runners, setRunners] = useState<Runner[]>(initialRunners);
    const [loading, setLoading] = useState(initialRunners.length === 0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchRunners() {
            try {
                const res = await fetch('/api/admin/scraper-network/runners');
                if (!res.ok) throw new Error('Failed to fetch runners');
                const data = await res.json();
                setRunners(data.runners || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        }

        if (initialRunners.length === 0) {
            fetchRunners();
        }

        // Poll every 30 seconds
        const interval = setInterval(fetchRunners, 30000);
        return () => clearInterval(interval);
    }, [initialRunners.length]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                {error}
            </div>
        );
    }

    if (runners.length === 0) {
        return (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                <Server className="mx-auto h-12 w-12 text-gray-600" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No Runners Connected</h3>
                <p className="mt-2 text-sm text-gray-600">
                    Set up a self-hosted runner to start scraping. See the setup guide below.
                </p>
            </div>
        );
    }

    const isOnline = (status: string) => ['online', 'idle', 'polling'].includes(status);
    const isBusy = (status: string, busy: boolean) => busy || status === 'running' || status === 'busy';

    const onlineCount = runners.filter(r => isOnline(r.status) && !isBusy(r.status, r.busy)).length;
    const busyCount = runners.filter(r => isBusy(r.status, r.busy)).length;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    {onlineCount} Ready
                </span>
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-yellow-500" />
                    {busyCount} Busy
                </span>
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                    {runners.length - onlineCount - busyCount} Offline
                </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {runners.map((runner) => {
                    const online = isOnline(runner.status);
                    const busy = isBusy(runner.status, runner.busy);
                    
                    return (
                        <div
                            key={runner.id}
                            className={`rounded-lg border p-4 ${online
                                ? busy
                                    ? 'border-yellow-200 bg-yellow-50'
                                    : 'border-green-200 bg-green-50'
                                : 'border-gray-200 bg-gray-50'
                                }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    {online ? (
                                        <Wifi className={`h-5 w-5 ${busy ? 'text-yellow-600' : 'text-green-600'}`} />
                                    ) : (
                                        <WifiOff className="h-5 w-5 text-gray-600" />
                                    )}
                                    <div>
                                        <h4 className="font-medium text-gray-900">{runner.name}</h4>
                                        <p className="text-sm text-gray-600">{runner.os}</p>
                                    </div>
                                </div>
                                <span
                                    className={`rounded-full px-2 py-1 text-xs font-medium ${online
                                        ? busy
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}
                                >
                                    {busy ? 'Busy' : online ? 'Ready' : 'Offline'}
                                </span>
                            </div>

                            {runner.labels.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1">
                                    {runner.labels.slice(0, 4).map((label) => (
                                        <span
                                            key={label.name}
                                            className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600"
                                        >
                                            {label.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
