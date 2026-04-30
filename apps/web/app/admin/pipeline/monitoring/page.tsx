import { Activity } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { MonitoringClient } from '@/components/admin/pipeline/MonitoringClient';

export default function PipelineMonitoringPage() {
    return (
        <AdminPageShell
            title="Pipeline Scraping"
            description="Monitor active scraper runs and AI consolidation batches in real time."
            icon={<Activity className="h-5 w-5" />}
        >
            <MonitoringClient />
        </AdminPageShell>
    );
}
