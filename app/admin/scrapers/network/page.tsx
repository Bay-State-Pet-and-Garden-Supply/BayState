import { Metadata } from 'next';
import { Network } from 'lucide-react';
import { ScraperNetworkDashboard } from './scraper-network/scraper-network-dashboard';

export const metadata: Metadata = {
    title: 'Scraper Network | Admin',
    description: 'Real-time monitoring of your distributed scraper fleet',
};

export default async function ScraperNetworkPage() {
    return (
        <div className="space-y-8">
            <ScraperNetworkDashboard />
        </div>
    );
}
