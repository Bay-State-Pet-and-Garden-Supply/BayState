import { Metadata } from 'next';
import { CostTrackingDashboard } from '@/components/admin/costs/CostTrackingDashboard';

export const metadata: Metadata = {
  title: 'Cost Tracking | Admin | Bay State Pet & Garden',
  description: 'Monitor monthly fixed services plus active external spend across AI Search, Crawl4AI, and consolidation.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CostTrackingPage() {
  return <CostTrackingDashboard />;
}
