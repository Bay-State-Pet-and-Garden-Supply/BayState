'use client';

import { useState, useEffect, useCallback } from 'react';
import { Key, Trash2, Loader2, Plus, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RunnerAccountModal } from './runner-account-modal';

interface RunnerAccount {
    name: string;
    status: string;
    last_seen_at: string | null;
    last_auth_at: string | null;
    has_credentials: boolean;
    current_job_id: string | null;
    created_at: string;
}

export function RunnerAccounts() {
    const [runners, setRunners] = useState<RunnerAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [keyModalRunner, setKeyModalRunner] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const fetchRunners = useCallback(async (silent = false) => {
        try {
            // Always show loading on explicit non-silent fetches (initial load or refresh)
            if (!silent) setLoading(true);
            const res = await fetch('/api/admin/runners/accounts');
            if (!res.ok) throw new Error('Failed to fetch runners');
            const data = await res.json();
            setRunners(data.runners || []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRunners();
    }, [fetchRunners]);

    const handleDelete = async (runnerName: string) => {
        if (!confirm(`Are you sure you want to delete ${runnerName}?\n\nThis will remove the runner and revoke all API keys.`)) {
            return;
        }

        setDeleting(runnerName);
        try {
            const res = await fetch(`/api/admin/runners/accounts?runner_name=${encodeURIComponent(runnerName)}&delete_runner=true`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete');
            }

            toast.success(`Runner ${runnerName} deleted`);
            fetchRunners();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete';
            toast.error(message);
        } finally {
            setDeleting(null);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    };

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

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Runner Accounts</h3>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => fetchRunners()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                    <Button size="sm" onClick={() => setShowModal(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Account
                    </Button>
                </div>
            </div>

            {runners.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                    <Key className="mx-auto h-12 w-12 text-gray-600" />
                    <h4 className="mt-4 text-lg font-medium text-gray-900">No Runner Accounts</h4>
                    <p className="mt-2 text-sm text-gray-600">
                        Create API keys to allow runners to authenticate.
                    </p>
                    <Button className="mt-4" onClick={() => setShowModal(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create First Account
                    </Button>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                                    Runner
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                                    Status
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                                    Last Auth
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                                    Last Seen
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {runners.map((runner) => (
                                <tr key={runner.name} className="hover:bg-gray-50">
                                    <td className="whitespace-nowrap px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {runner.has_credentials ? (
                                                <ShieldCheck className="h-5 w-5 text-green-600" />
                                            ) : (
                                                <ShieldX className="h-5 w-5 text-gray-600" />
                                            )}
                                            <div>
                                                <div className="font-medium text-gray-900">{runner.name}</div>
                                                <div className="text-xs text-gray-600 font-mono">
                                                    {runner.has_credentials ? 'API key configured' : 'No API key'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3">
                                        <Badge
                                            variant={['online', 'idle', 'polling'].includes(runner.status) ? "success" : ['busy', 'running'].includes(runner.status) ? "warning" : "secondary"}
                                            className={`
                                                ${['online', 'idle', 'polling'].includes(runner.status)
                                                    ? 'bg-green-100 text-green-800 hover:bg-green-200 border-none'
                                                    : ['busy', 'running'].includes(runner.status)
                                                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-none'
                                                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-none'
                                                }
                                            `}
                                        >
                                            {runner.status}
                                        </Badge>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                                        {formatDate(runner.last_auth_at)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                                        {formatDate(runner.last_seen_at)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setKeyModalRunner(runner.name)}
                                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                title="Generate New API Key"
                                            >
                                                <Key className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(runner.name)}
                                                disabled={deleting === runner.name}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                title="Delete Runner"
                                            >
                                                {deleting === runner.name ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {(showModal || keyModalRunner) && (
                <RunnerAccountModal
                    onClose={() => {
                        setShowModal(false);
                        setKeyModalRunner(null);
                    }}
                    onSave={() => fetchRunners(true)}
                    initialRunnerName={keyModalRunner || undefined}
                />
            )}
        </div>
    );
}
