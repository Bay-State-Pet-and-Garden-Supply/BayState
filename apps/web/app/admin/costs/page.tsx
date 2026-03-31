import { Metadata } from 'next';
import { CostTrackingDashboard } from '@/components/admin/costs/CostTrackingDashboard';

export const metadata: Metadata = {
  title: 'Cost Tracking | Admin | Bay State Pet & Garden',
  description: 'Monitor and manage monthly costs across all services and AI usage.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CostTrackingPage() {
  return <CostTrackingDashboard />;
}
