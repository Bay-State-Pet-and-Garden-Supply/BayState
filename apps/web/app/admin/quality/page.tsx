import { QualityDashboard } from '@/components/admin/quality/QualityDashboard';
import { QualityIssueTable } from '@/components/admin/quality/QualityIssueTable';

export default function QualityPage() {
  return (
    <div className="space-y-8 p-8">
      <QualityDashboard />
      <QualityIssueTable />
    </div>
  );
}
