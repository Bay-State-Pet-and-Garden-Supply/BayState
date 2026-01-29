import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { NetworkClient } from '@/components/admin/scrapers/NetworkClient';

export const metadata: Metadata = {
    title: 'Scraper Network | Admin',
    description: 'Manage your distributed scraper fleet',
};

export const dynamic = 'force-dynamic';

export default async function ScraperNetworkPage() {
    const supabase = await createClient();

    const { data: runnersData, error } = await supabase
        .from('scraper_runners')
        .select('*')
        .order('last_seen_at', { ascending: false });

    if (error) {
        console.error('Failed to fetch runners:', error);
    }

    // Compute status based on last_seen_at (same logic as API)
    const now = new Date();
    const runners = (runnersData || []).map((r: { name: string; status: string; last_seen_at: string | null; metadata?: Record<string, unknown> }) => {
        const lastSeen = r.last_seen_at ? new Date(r.last_seen_at) : null;
        const minutesSinceSeen = lastSeen ? (now.getTime() - lastSeen.getTime()) / 1000 / 60 : Infinity;

        // Mark as offline if not seen in 5 minutes
        let status = r.status || 'offline';
        if (minutesSinceSeen > 5) {
            status = 'offline';
        }

        return {
            id: r.name,
            name: r.name,
            os: 'Linux/Mac',
            status: (status === 'busy' ? 'online' : status) as 'offline' | 'online',
            busy: status === 'busy',
            labels: []
        };
    });

    const { data: jobs } = await supabase
        .from('scrape_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    return (
        <NetworkClient
            initialRunners={runners}
            initialJobs={jobs || []}
        />
    );
}
