import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateAPIKey } from '@/lib/scraper-auth';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

async function getAuthenticatedUser() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
            },
        }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

interface CreateKeyRequest {
    runner_name: string;
    description?: string;
    expires_in_days?: number;
}

/**
 * GET /api/admin/runners/accounts
 * 
 * Lists all runners with their API key information (not the actual keys).
 */
export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    // Get all runners
    const { data: runners, error: runnersError } = await admin
        .from('scraper_runners')
        .select(`
            name,
            status,
            last_seen_at,
            current_job_id,
            metadata,
            created_at
        `)
        .order('created_at', { ascending: false });

    if (runnersError) {
        console.error('[Runner Accounts] Failed to fetch runners:', runnersError);
        return NextResponse.json({ error: 'Failed to fetch runners' }, { status: 500 });
    }

    // Get API keys for each runner (metadata only, not the actual keys)
    const runnersWithKeys = await Promise.all(
        (runners || []).map(async (runner) => {
            const { data: keys } = await admin
                .from('runner_api_keys')
                .select('id, key_prefix, description, created_at, expires_at, last_used_at, revoked_at')
                .eq('runner_name', runner.name)
                .order('created_at', { ascending: false });

            const activeKeys = (keys || []).filter(k => !k.revoked_at);
            const hasActiveKey = activeKeys.length > 0;

            return {
                ...runner,
                api_keys: keys || [],
                has_active_key: hasActiveKey,
                active_key_count: activeKeys.length,
            };
        })
    );

    return NextResponse.json({ runners: runnersWithKeys });
}

/**
 * POST /api/admin/runners/accounts
 * 
 * Creates a new API key for a runner. Returns the full key (only shown once).
 */
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateKeyRequest = await request.json();
    
    if (!body.runner_name || typeof body.runner_name !== 'string') {
        return NextResponse.json({ error: 'runner_name is required' }, { status: 400 });
    }

    const runnerName = body.runner_name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (runnerName.length < 3 || runnerName.length > 50) {
        return NextResponse.json({ error: 'runner_name must be 3-50 characters' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Ensure runner exists (create if not)
    const { data: existingRunner } = await admin
        .from('scraper_runners')
        .select('name')
        .eq('name', runnerName)
        .single();

    if (!existingRunner) {
        // Create the runner record
        const { error: createError } = await admin
            .from('scraper_runners')
            .insert({
                name: runnerName,
                status: 'offline',
                created_at: new Date().toISOString(),
            });

        if (createError) {
            console.error('[Runner Accounts] Failed to create runner:', createError);
            return NextResponse.json({ error: 'Failed to create runner' }, { status: 500 });
        }
    }

    // Generate new API key
    const { key, hash, prefix } = generateAPIKey();

    // Calculate expiry if specified
    let expiresAt: string | null = null;
    if (body.expires_in_days && body.expires_in_days > 0) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + body.expires_in_days);
        expiresAt = expiry.toISOString();
    }

    // Insert the key
    const { error: insertError } = await admin
        .from('runner_api_keys')
        .insert({
            runner_name: runnerName,
            key_hash: hash,
            key_prefix: prefix,
            description: body.description || 'API Key',
            expires_at: expiresAt,
            created_by: user.id,
        });

    if (insertError) {
        console.error('[Runner Accounts] Failed to create API key:', insertError);
        return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    console.log(`[Runner Accounts] Created API key for runner: ${runnerName} (prefix: ${prefix})`);

    return NextResponse.json({
        runner_name: runnerName,
        api_key: key,
        key_prefix: prefix,
        expires_at: expiresAt,
        message: 'Save this API key now. It cannot be retrieved again.',
    });
}

/**
 * DELETE /api/admin/runners/accounts
 * 
 * Revokes an API key. Supports revoking by key_id or all keys for a runner.
 */
export async function DELETE(request: NextRequest) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('key_id');
    const runnerName = searchParams.get('runner_name');
    const revokeAll = searchParams.get('revoke_all') === 'true';
    const deleteRunner = searchParams.get('delete_runner') === 'true';

    if (!keyId && !runnerName) {
        return NextResponse.json(
            { error: 'Either key_id or runner_name query parameter required' },
            { status: 400 }
        );
    }

    const admin = getSupabaseAdmin();

    if (runnerName && deleteRunner) {
        const { error } = await admin
            .from('scraper_runners')
            .delete()
            .eq('name', runnerName);

        if (error) {
            console.error('[Runner Accounts] Failed to delete runner:', error);
            return NextResponse.json({ error: 'Failed to delete runner' }, { status: 500 });
        }

        console.log(`[Runner Accounts] Deleted runner: ${runnerName}`);
        return NextResponse.json({ success: true, message: `Runner ${runnerName} deleted` });
    }

    if (keyId) {
        // Revoke specific key
        const { error } = await admin
            .from('runner_api_keys')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', keyId)
            .is('revoked_at', null);

        if (error) {
            console.error('[Runner Accounts] Failed to revoke key:', error);
            return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 });
        }

        console.log(`[Runner Accounts] Revoked API key: ${keyId}`);
        return NextResponse.json({ success: true, message: 'API key revoked' });
    }

    if (runnerName && revokeAll) {
        // Revoke all keys for a runner
        const { error, count } = await admin
            .from('runner_api_keys')
            .update({ revoked_at: new Date().toISOString() })
            .eq('runner_name', runnerName)
            .is('revoked_at', null);

        if (error) {
            console.error('[Runner Accounts] Failed to revoke keys:', error);
            return NextResponse.json({ error: 'Failed to revoke keys' }, { status: 500 });
        }

        console.log(`[Runner Accounts] Revoked ${count || 0} API keys for runner: ${runnerName}`);
        return NextResponse.json({ 
            success: true, 
            message: `Revoked ${count || 0} API key(s) for ${runnerName}` 
        });
    }

    return NextResponse.json(
        { error: 'Use revoke_all=true to revoke all keys for a runner' },
        { status: 400 }
    );
}
