import { Metadata } from 'next';
import { Suspense } from 'react';
import { ExportWorkspace } from '@/components/admin/pipeline/ExportWorkspace';
import { Spinner } from '@/components/ui/spinner';

export const metadata: Metadata = {
    title: 'Export Products | Bay State',
    description: 'Generate Excel exports of pipeline products',
};

function ExportLoadingState() {
    return (
        <div className="flex items-center justify-center p-8">
            <Spinner size="lg" className="text-[#008850]" />
            <span className="ml-3 text-muted-foreground">Loading export workspace...</span>
        </div>
    );
}

export default function PipelineExportPage() {
    return (
        <div className="space-y-6">
            <Suspense fallback={<ExportLoadingState />}>
                <ExportWorkspace />
            </Suspense>
        </div>
    );
}
