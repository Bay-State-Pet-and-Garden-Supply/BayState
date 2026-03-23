'use client';

import { Upload, Download, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface PipelineToolActionsProps {
    onImport?: () => void;
    onExport?: () => void;
    onImages?: () => void;
    className?: string;
}

export function PipelineToolActions({
    onImport,
    onExport,
    onImages,
    className = '',
}: PipelineToolActionsProps) {
    const handleImport = () => {
        if (onImport) {
            onImport();
        } else {
            toast.info('Import functionality - opens Integra import modal');
        }
    };

    const handleExport = () => {
        if (onExport) {
            onExport();
        } else {
            toast.info('Export functionality - opens export dialog');
        }
    };

    const handleImages = () => {
        if (onImages) {
            onImages();
        } else {
            toast.info('Images functionality - opens image manager');
        }
    };

    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`}>
            <Button
                variant="outline"
                size="sm"
                onClick={handleImport}
                className="flex items-center gap-2 border-[#008850] text-[#008850] hover:bg-[#008850] hover:text-white"
            >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Import</span>
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="flex items-center gap-2 border-border text-muted-foreground hover:bg-muted"
            >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleImages}
                className="flex items-center gap-2 border-border text-muted-foreground hover:bg-muted"
            >
                <ImageIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Images</span>
            </Button>
        </div>
    );
}
