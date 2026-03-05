import { AnalyticsClient } from '@/components/admin/analytics';

export default function AnalyticsPage() {
  return (
    <div className="p-8">
      <AnalyticsClient initialRange="7days" />
    </div>
  );
}
