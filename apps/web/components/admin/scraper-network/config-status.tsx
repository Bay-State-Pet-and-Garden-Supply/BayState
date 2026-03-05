'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw, ChevronDown, ChevronUp, Settings } from 'lucide-react';

interface ConfigCheck {
    name: string;
    status: 'ok' | 'error' | 'warning';
    message: string;
}

export function ConfigStatus() {
    const [checks, setChecks] = useState<ConfigCheck[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);

    const runChecks = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/scraper-network/health');
            if (!res.ok) throw new Error('Health check failed');
            const data = await res.json();
            setChecks(data.checks || []);
        } catch {
            setChecks([
                { name: 'API', status: 'error', message: 'Failed to reach health endpoint' }
            ]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        runChecks();
    }, []);

    const getIcon = (status: ConfigCheck['status']) => {
        switch (status) {
            case 'ok':
                return <CheckCircle2 className="h-4 w-4 text-green-600" />;
            case 'warning':
                return <AlertCircle className="h-4 w-4 text-yellow-600" />;
            case 'error':
                return <XCircle className="h-4 w-4 text-red-600" />;
        }
    };

    const allGood = checks.every(c => c.status === 'ok');
    const hasErrors = checks.some(c => c.status === 'error');
    const hasWarnings = checks.some(c => c.status === 'warning');

    const getStatusSummary = () => {
        if (loading) return { text: 'Checking...', color: 'text-gray-600' };
        if (hasErrors) return { text: `${checks.filter(c => c.status === 'error').length} issue(s)`, color: 'text-red-600' };
        if (hasWarnings) return { text: `${checks.filter(c => c.status === 'warning').length} warning(s)`, color: 'text-yellow-600' };
        return { text: 'All systems operational', color: 'text-green-600' };
    };

    const status = getStatusSummary();

    return (
        <div className="rounded-lg border border-gray-200 bg-white">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsOpen(!isOpen);
                    }
                }}
            >
                <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5 text-gray-600" />
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">Configuration Status</span>
                        {!loading && (
                            <span className={`text-sm ${status.color}`}>
                                — {status.text}
                            </span>
                        )}
                        {loading && (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            runChecks();
                        }}
                        disabled={loading}
                        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-700 disabled:opacity-50 p-1 rounded hover:bg-gray-100"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {isOpen ? (
                        <ChevronUp className="h-5 w-5 text-gray-600" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-gray-600" />
                    )}
                </div>
            </div>

            {isOpen && (
                <div className="border-t border-gray-200 p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {checks.map((check) => (
                                <div key={check.name} className="flex items-start gap-3">
                                    {getIcon(check.status)}
                                    <div>
                                        <p className="font-medium text-gray-900">{check.name}</p>
                                        <p className="text-sm text-gray-600">{check.message}</p>
                                    </div>
                                </div>
                            ))}

                            {allGood && checks.length > 0 && (
                                <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                                    ✓ All systems operational. Ready to scrape!
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
