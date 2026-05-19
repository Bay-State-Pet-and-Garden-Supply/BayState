import { ShieldAlert } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { QualityDashboard } from '@/components/admin/quality/QualityDashboard';
import { QualityIssueTable } from '@/components/admin/quality/QualityIssueTable';

export default function QualityPage() {
  return (
    <AdminPageShell
      title="Quality review"
      description="Triage products that need manual attention, then move back into the catalog or pipeline with clear next steps."
      icon={<ShieldAlert className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <QualityDashboard />
      <QualityIssueTable />
    </AdminPageShell>
  );
}
