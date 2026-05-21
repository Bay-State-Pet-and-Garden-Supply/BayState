import { Wrench } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { ToolsClient } from '@/components/admin/pipeline/ToolsClient';

export default function PipelineToolsPage() {
    return (
        <AdminPageShell
            title="Pipeline tools"
            description="Open supporting actions for importing, publishing, and image-related pipeline work."
            icon={<Wrench className="h-5 w-5" />}
            eyebrow="Workspace view"
        >
            <ToolsClient />
        </AdminPageShell>
    );
}
