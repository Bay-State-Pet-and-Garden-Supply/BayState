import { Metadata } from 'next';
import { Network } from 'lucide-react';
import { RunnerGrid } from '@/components/admin/scraper-network/runner-grid';
import { ConfigStatus } from '@/components/admin/scraper-network/config-status';
import { JobHistory } from '@/components/admin/scraper-network/job-history';
import { SetupGuide } from '@/components/admin/scraper-network/setup-guide';
import { RunnerAccounts } from '@/components/admin/scraper-network/runner-accounts';

export const metadata: Metadata = {
    title: 'Scraper Network | Admin',
    description: 'Manage your distributed scraper fleet',
};

export default function ScraperNetworkPage() {
    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                    <Network className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Scraper Network</h1>
                    <p className="text-sm text-gray-600">Manage self-hosted runners and monitor scraping jobs</p>
                </div>
            </div>

            {/* Config Status */}
            <ConfigStatus />

            <RunnerAccounts />

            {/* Runners */}
            <div>
                <h2 className="mb-3 text-lg font-semibold text-gray-900">Connected Runners</h2>
                <RunnerGrid />
            </div>

            {/* Job History */}
            <JobHistory />

            {/* Setup Guide */}
            <SetupGuide />
        </div>
    );
}
