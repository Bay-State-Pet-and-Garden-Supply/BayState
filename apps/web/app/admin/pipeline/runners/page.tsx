import type { Metadata } from 'next';
import { Rocket } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { ScraperNetworkDashboard } from './scraper-network/scraper-network-dashboard';

export const metadata: Metadata = {
  title: 'Runner Health | Admin',
  description: 'Monitor scraper runners, connection status, and operator follow-up work.',
};

export default async function ScraperNetworkPage() {
  return (
    <AdminPageShell
      title="Runner health"
      description="Monitor live runner status, open details without losing your place, and keep the scraper network ready for work."
      icon={<Rocket className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <ScraperNetworkDashboard />
    </AdminPageShell>
  );
}
