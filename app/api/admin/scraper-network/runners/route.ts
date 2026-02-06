import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface RunnerData {
    name: string;
    last_seen_at: string;
    status: 'online' | 'offline' | 'busy' | 'idle' | 'polling';
    current_job_id: string | null;
    metadata: Record<string, unknown>;
}

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: runnersData, error } = await supabase
            .from('scraper_runners')
            .select('*')
            .order('last_seen_at', { ascending: false });

        if (error) throw error;

        const now = new Date();
        const runners = (runnersData as RunnerData[]).map(r => {
            const lastSeen = new Date(r.last_seen_at);
            const minutesSinceSeen = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

            let status = r.status;
            if (minutesSinceSeen > 5) {
                status = 'offline';
            }

            return {
                id: r.name,
                name: r.name,
                os: 'Linux/Mac',
                status: (status === 'offline' || r.status === 'offline') ? 'offline' : 'online',
                busy: status === 'busy',
                labels: []
            };
        });

        const onlineCount = runners.filter(r => r.status === 'online').length;
        const offlineCount = runners.filter(r => r.status === 'offline').length;

        return NextResponse.json({
            runners,
            available: true,
            onlineCount,
            offlineCount,
        });
    } catch (error) {
        console.error('[Runners API] Error:', error);
        return NextResponse.json(
            {
                runners: [],
                available: false,
                error: error instanceof Error ? error.message : 'Failed to fetch runners'
            },
            { status: 500 }
        );
    }
}
