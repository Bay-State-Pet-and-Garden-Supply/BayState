import { Wrench } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { ToolsClient } from '@/components/admin/pipeline/ToolsClient';

export default function PipelineToolsPage() {
    return (
        <AdminPageShell
            title="Pipeline Tools"
            description="Import products, export data, and manage product images."
            icon={<Wrench className="h-5 w-5" />}
        >
            <ToolsClient />
        </AdminPageShell>
    );
}
