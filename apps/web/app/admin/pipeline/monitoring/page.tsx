import { Activity } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { MonitoringClient } from '@/components/admin/pipeline/MonitoringClient';

export default function PipelineMonitoringPage() {
    return (
        <AdminPageShell
            title="Pipeline monitoring"
            description="Monitor active scraper runs and consolidation activity without leaving the pipeline system."
            icon={<Activity className="h-5 w-5" />}
            eyebrow="Workspace view"
        >
            <MonitoringClient />
        </AdminPageShell>
    );
}
