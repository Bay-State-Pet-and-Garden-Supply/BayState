import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface UpdateKeyRequest {
    description?: string;
    expires_in_days?: number | null;
}

/**
 * PATCH /api/admin/api-keys/[id]
 *
 * Updates an API key's description or expiry.
 * Only the key owner can update their keys.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) {
        return auth.response;
    }

    const { id } = await params;

    if (!id) {
        return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    let body: UpdateKeyRequest = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Verify ownership
    const { data: existingKey, error: fetchError } = await supabase
        .from('user_api_keys')
        .select('id, user_id, revoked_at')
        .eq('id', id)
        .single();

    if (fetchError || !existingKey) {
        console.error('[Admin API Keys] Key not found:', id);
        return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (existingKey.user_id !== auth.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (existingKey.revoked_at) {
        return NextResponse.json(
            { error: 'Cannot update a revoked API key' },
            { status: 400 }
        );
    }

    // Build update payload
    const update: Record<string, string | null> = {};

    if (body.description !== undefined) {
        update.description =
            typeof body.description === 'string' && body.description.trim().length > 0
                ? body.description.trim()
                : null;
    }

    if (body.expires_in_days !== undefined) {
        if (body.expires_in_days === null || body.expires_in_days <= 0) {
            update.expires_at = null;
        } else {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + body.expires_in_days);
            update.expires_at = expiry.toISOString();
        }
    }

    if (Object.keys(update).length === 0) {
        return NextResponse.json(
            { error: 'No valid fields to update (description, expires_in_days)' },
            { status: 400 }
        );
    }

    const { error: updateError } = await supabase
        .from('user_api_keys')
        .update(update)
        .eq('id', id)
        .eq('user_id', auth.user.id);

    if (updateError) {
        console.error('[Admin API Keys] Failed to update key:', updateError);
        return NextResponse.json({ error: 'Failed to update API key' }, { status: 500 });
    }

    console.log(`[Admin API Keys] Updated API key: ${id}`);

    return NextResponse.json({ success: true, message: 'API key updated' });
}

/**
 * DELETE /api/admin/api-keys/[id]
 *
 * Revokes an API key by setting revoked_at.
 * Only the key owner can revoke their own keys.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) {
        return auth.response;
    }

    const { id } = await params;

    if (!id) {
        return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Verify ownership
    const { data: existingKey, error: fetchError } = await supabase
        .from('user_api_keys')
        .select('id, user_id, revoked_at')
        .eq('id', id)
        .single();

    if (fetchError || !existingKey) {
        console.error('[Admin API Keys] Key not found:', id);
        return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (existingKey.user_id !== auth.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (existingKey.revoked_at) {
        return NextResponse.json(
            { error: 'API key is already revoked' },
            { status: 400 }
        );
    }

    // Revoke the key (soft delete)
    const { error: revokeError } = await supabase
        .from('user_api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', auth.user.id);

    if (revokeError) {
        console.error('[Admin API Keys] Failed to revoke key:', revokeError);
        return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
    }

    console.log(`[Admin API Keys] Revoked API key: ${id}`);

    return NextResponse.json({ success: true, message: 'API key revoked' });
}
