import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateAdminApiKey } from '@/lib/admin-api-key-auth';
import { requireAdminAuth } from '@/lib/admin/api-auth';

/**
 * GET /api/admin/api-keys
 *
 * Lists the current user's API keys (masked — prefix + last 4 chars only).
 * The full key is never returned after creation.
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) {
        return auth.response;
    }

    const supabase = await createAdminClient();

    const { data: keys, error } = await supabase
        .from('user_api_keys')
        .select('id, key_prefix, description, created_at, expires_at, last_used_at, revoked_at')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[Admin API Keys] Failed to fetch keys:', error);
        return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }

    // Mask keys: show prefix + last 4 chars
    const maskedKeys = (keys || []).map((key) => {
        const isActive = !key.revoked_at;
        return {
            id: key.id,
            key_suffix: key.key_prefix.slice(0, 8) + '...' + key.key_prefix.slice(-4),
            description: key.description,
            created_at: key.created_at,
            expires_at: key.expires_at,
            last_used_at: key.last_used_at,
            revoked_at: key.revoked_at,
            is_active: isActive,
        };
    });

    return NextResponse.json({ api_keys: maskedKeys });
}

/**
 * POST /api/admin/api-keys
 *
 * Creates a new API key for the current user.
 * Returns the full key once — it cannot be retrieved again.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) {
        return auth.response;
    }

    let body: { description?: string; expires_in_days?: number } = {};
    try {
        body = await request.json();
    } catch {
        // No body or invalid JSON — use defaults
    }

    const description =
        typeof body.description === 'string' && body.description.trim().length > 0
            ? body.description.trim()
            : null;

    const expiresInDays =
        typeof body.expires_in_days === 'number' && body.expires_in_days > 0
            ? body.expires_in_days
            : null;

    // Generate new API key
    const { key, hash, prefix } = generateAdminApiKey();

    // Calculate expiry if specified
    let expiresAt: string | null = null;
    if (expiresInDays) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + expiresInDays);
        expiresAt = expiry.toISOString();
    }

    const supabase = await createAdminClient();

    // Insert the key
    const { data: insertedKey, error: insertError } = await supabase
        .from('user_api_keys')
        .insert({
            user_id: auth.user.id,
            key_hash: hash,
            key_prefix: prefix,
            description,
            expires_at: expiresAt,
            created_by: auth.user.id,
        })
        .select('id')
        .single();

    if (insertError) {
        console.error('[Admin API Keys] Failed to create API key:', insertError);
        return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    console.log(
        `[Admin API Keys] Created API key for user ${auth.user.id} (prefix: ${prefix})`
    );

    return NextResponse.json({
        id: insertedKey.id,
        api_key: key,
        key_prefix: prefix,
        description,
        expires_at: expiresAt,
        message: 'Save this API key now. It cannot be retrieved again.',
    });
}
