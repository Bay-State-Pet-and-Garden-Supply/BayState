'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, AlertTriangle, Check, Loader2 } from 'lucide-react';

const PIPELINE_STATUSES = [
    { value: 'registered', label: 'Registered' },
    { value: 'enriched', label: 'Enriched' },
    { value: 'finalized', label: 'Finalized' },
    { value: 'failed', label: 'Failed' },
];

interface ExportTabProps {
    className?: string;
    productCounts?: Record<string, number>;
}

export function ExportTab({ className, productCounts = {} }: ExportTabProps) {
    const [status, setStatus] = useState('finalized');
    const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
    const [downloading, setDownloading] = useState(false);
    const [success, setSuccess] = useState(false);

    const count = productCounts[status] || 0;
    const needsImages = status === 'finalized' && count > 0 && productCounts['needs-images'] > 0;

    const handleExport = async () => {
        setDownloading(true);
        setSuccess(false);

        try {
            const response = await fetch(`/api/admin/pipeline/export?status=${status}&format=${format}`);
            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pipeline-export-${status}-${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className={`max-w-2xl ${className}`}>
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-medium text-gray-900 mb-6">Export Products</h3>

                {needsImages && (
                    <div className="mb-6 rounded-md border border-yellow-200 bg-yellow-50 p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-yellow-800">
                                    {productCounts['needs-images']} product{productCounts['needs-images'] !== 1 ? 's' : ''} need image selection
                                </p>
                                <p className="text-sm text-yellow-700 mt-1">
                                    Please select images before exporting for best results.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Status Filter
                        </label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-[#008850] focus:ring-[#008850] sm:text-sm"
                        >
                            {PIPELINE_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label} ({productCounts[s.value] || 0})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Export Format
                        </label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setFormat('xlsx')}
                                className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
                                    format === 'xlsx'
                                        ? 'border-[#008850] bg-[#008850]/10 text-[#008850]'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <FileSpreadsheet className="h-4 w-4" />
                                Excel (.xlsx)
                            </button>
                            <button
                                onClick={() => setFormat('csv')}
                                className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
                                    format === 'csv'
                                        ? 'border-[#008850] bg-[#008850]/10 text-[#008850]'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <FileText className="h-4 w-4" />
                                CSV
                            </button>
                        </div>
                    </div>

                    <div className="rounded-md bg-gray-50 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Products to export</p>
                                <p className="text-2xl font-semibold text-gray-900">{count}</p>
                            </div>
                            <button
                                onClick={handleExport}
                                disabled={downloading || count === 0}
                                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white ${
                                    success
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : 'bg-[#008850] hover:bg-[#007a48]'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {downloading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Exporting...
                                    </>
                                ) : success ? (
                                    <>
                                        <Check className="h-4 w-4" />
                                        Downloaded!
                                    </>
                                ) : (
                                    <>
                                        <Download className="h-4 w-4" />
                                        Export {count} Products
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
