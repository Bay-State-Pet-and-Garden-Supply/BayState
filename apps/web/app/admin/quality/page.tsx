import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { QualityDashboard } from '@/components/admin/quality/QualityDashboard';
import { QualityIssueTable } from '@/components/admin/quality/QualityIssueTable';

export default function QualityPage() {
  return (
    <AdminPageShell title="Quality Control">
      <QualityDashboard />
      <QualityIssueTable />
    </AdminPageShell>
  );
}
