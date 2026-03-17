import React, { useState } from 'react';
import { Download, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ExportTabProps {
    count: number;
    filters: any;
}

export const ExportTab: React.FC<ExportTabProps> = ({ count, filters }) => {
    const [downloading, setDownloading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExport = async () => {
        try {
            setDownloading(true);
            setError(null);
            
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.search) params.append('search', filters.search);
            
            const response = await fetch(`/api/admin/pipeline/export?${params.toString()}`);
            if (!response.ok) throw new Error('Export failed');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pipeline-export-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            setSuccess(true);
            setTimeout(() => setSuccess(false), 5000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-green-600" />
                        Export Data
                    </CardTitle>
                    <CardDescription>
                        Export current pipeline products to CSV format for external processing or reporting.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-900">
                                    Current Filtered Dataset
                                </p>
                                <p className="text-xs text-gray-500">
                                    Includes {count} products matching your active filters.
                                </p>
                            </div>
                            
                            <Button
                                onClick={handleExport}
                                disabled={downloading || count === 0}
                                className={success ? 'bg-green-600 hover:bg-green-700' : ''}
                            >
                                {downloading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Exporting…
                                    </>
                                ) : success ? (
                                    <>
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Export Complete
                                    </>
                                ) : (
                                    <>
                                        <Download className="mr-2 h-4 w-4" />
                                        Export to CSV
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Export Options</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked readOnly className="rounded border-gray-300" />
                            <span className="text-sm text-gray-600">Include all available fields</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked readOnly className="rounded border-gray-300" />
                            <span className="text-sm text-gray-600">Format for Shopify Import</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked readOnly className="rounded border-gray-300" />
                            <span className="text-sm text-gray-600">Include image URLs</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Recent Exports</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500 italic">No recent exports in this session.</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
