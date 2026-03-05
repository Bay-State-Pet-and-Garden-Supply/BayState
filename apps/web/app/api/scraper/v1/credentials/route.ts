import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}

const CREDENTIAL_KEYS: Record<string, { username: string; password: string }> = {
    petfoodex: { username: 'petfoodex_username', password: 'petfoodex_password' },
    phillips: { username: 'phillips_username', password: 'phillips_password' },
    orgill: { username: 'orgill_username', password: 'orgill_password' },
    shopsite: { username: 'shopsite_username', password: 'shopsite_password' },
};

export async function GET(request: NextRequest) {
    try {
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const scraperName = searchParams.get('scraper')?.toLowerCase();

        if (!scraperName) {
            return NextResponse.json(
                { error: 'Missing required parameter: scraper' },
                { status: 400 }
            );
        }

        if (runner.allowedScrapers !== null && runner.allowedScrapers !== undefined) {
            if (!runner.allowedScrapers.includes(scraperName)) {
                console.warn(`[Credentials] Runner ${runner.runnerName} not allowed to access ${scraperName}`);
                return NextResponse.json(
                    { error: `Runner not authorized for scraper: ${scraperName}` },
                    { status: 403 }
                );
            }
        }

        const credentialMapping = CREDENTIAL_KEYS[scraperName];
        if (!credentialMapping) {
            return NextResponse.json(
                { error: `No credentials configured for scraper: ${scraperName}` },
                { status: 404 }
            );
        }

        const supabase = getSupabaseAdmin();

        const { data: settings, error } = await supabase
            .from('app_settings')
            .select('key, value')
            .in('key', [credentialMapping.username, credentialMapping.password]);

        if (error) {
            console.error(`[Credentials] Failed to fetch for ${scraperName}:`, error);
            return NextResponse.json(
                { error: 'Failed to fetch credentials' },
                { status: 500 }
            );
        }

        const settingsMap = new Map(settings?.map(s => [s.key, s.value]) || []);
        const username = settingsMap.get(credentialMapping.username) as string | undefined;
        const password = settingsMap.get(credentialMapping.password) as string | undefined;

        if (!username || !password) {
            console.warn(`[Credentials] Missing credentials for ${scraperName}`);
            return NextResponse.json(
                { error: `Credentials not configured for ${scraperName}` },
                { status: 404 }
            );
        }

        console.log(`[Credentials] Providing ${scraperName} credentials to runner ${runner.runnerName}`);

        return NextResponse.json({
            username,
            password,
        });
    } catch (error) {
        console.error('[Credentials] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
