'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { PipelineStatus } from '@/lib/pipeline';

interface ExportButtonProps {
    currentStatus: PipelineStatus;
    searchQuery?: string;
}

export function ExportButton({ currentStatus, searchQuery }: ExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams();
            params.set('status', currentStatus);
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const url = `/api/admin/pipeline/export?${params.toString()}`;
            
            // Trigger download
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `pipeline-export-${currentStatus}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            // Small delay to show feedback
            setTimeout(() => setIsExporting(false), 1000);
        }
    };

    return (
        <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
            title="Export to CSV"
        >
            {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Download className="h-4 w-4" />
            )}
            {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
    );
}
