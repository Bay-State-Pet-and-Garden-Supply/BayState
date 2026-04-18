'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/supabase/config';
import { revalidatePath } from 'next/cache';
import { hasRole } from '@/lib/auth/roles';

/**
 * Verify admin access for server actions
 */
async function verifyAdminAccess(): Promise<{ userId: string | null; error: string | null }> {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return { userId: null, error: 'Authentication required' };
    }

    const isAdmin = await hasRole(user.id, 'admin');
    if (!isAdmin) {
        return { userId: null, error: 'Admin access required' };
    }

    return { userId: user.id, error: null };
}

/**
 * Get service role client for admin operations
 */
function getServiceRoleClient() {
    return createServiceClient(
        SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );
}

/**
 * Rename a runner
 */
export async function renameRunner(id: string, newName: string): Promise<{ success: boolean; error?: string }> {
    const { error: adminError } = await verifyAdminAccess();
    if (adminError) {
        return { success: false, error: adminError };
    }

    // Validate new name
    if (!newName || newName.trim().length === 0) {
        return { success: false, error: 'Runner name cannot be empty' };
    }

    if (newName.length > 100) {
        return { success: false, error: 'Runner name must be 100 characters or less' };
    }

    const supabase = getServiceRoleClient();

    // Check if runner exists
    const { data: existingRunner, error: fetchError } = await supabase
        .from('scraper_runners')
        .select('name')
        .eq('name', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Check if name is already taken by another runner
    const { data: duplicateName } = await supabase
        .from('scraper_runners')
        .select('name')
        .eq('name', newName.trim())
        .neq('name', id)
        .single();

    if (duplicateName) {
        return { success: false, error: 'A runner with this name already exists' };
    }

    // Update runner name (scraper_runners has no updated_at column)
    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ name: newName.trim() })
        .eq('name', id);

    if (updateError) {
        console.error(`Error renaming runner ${id}:`, updateError);
        return { success: false, error: 'Failed to rename runner' };
    }

    revalidatePath('/admin/scrapers/network');
    return { success: true };
}

/**
 * Disable a runner from claiming new jobs while keeping its API keys intact.
 */
export async function disableRunner(id: string): Promise<{ success: boolean; error?: string }> {
    const { error: adminError } = await verifyAdminAccess();
    if (adminError) {
        return { success: false, error: adminError };
    }

    const supabase = getServiceRoleClient();

    const { data: existingRunner, error: fetchError } = await supabase
        .from('scraper_runners')
        .select('name, enabled')
        .eq('name', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    if (!existingRunner.enabled) {
        return { success: false, error: 'Runner is already disabled' };
    }

    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ enabled: false })
        .eq('name', id);

    if (updateError) {
        console.error(`Error disabling runner ${id}:`, updateError);
        return { success: false, error: 'Failed to disable runner' };
    }

    revalidatePath('/admin/scrapers/network');
    return { success: true };
}

/**
 * Re-enable a runner so it can claim new jobs again.
 */
export async function enableRunner(id: string): Promise<{ success: boolean; error?: string }> {
    const { error: adminError } = await verifyAdminAccess();
    if (adminError) {
        return { success: false, error: adminError };
    }

    const supabase = getServiceRoleClient();

    const { data: existingRunner, error: fetchError } = await supabase
        .from('scraper_runners')
        .select('name, enabled')
        .eq('name', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    if (existingRunner.enabled) {
        return { success: false, error: 'Runner is already enabled' };
    }

    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ enabled: true })
        .eq('name', id);

    if (updateError) {
        console.error(`Error enabling runner ${id}:`, updateError);
        return { success: false, error: 'Failed to enable runner' };
    }

    revalidatePath('/admin/scrapers/network');
    return { success: true };
}

/**
 * Pause a runner - prevents new jobs from being assigned
 */
export async function pauseRunner(id: string): Promise<{ success: boolean; error?: string }> {
    const { error: adminError } = await verifyAdminAccess();
    if (adminError) {
        return { success: false, error: adminError };
    }

    const supabase = getServiceRoleClient();

    // Check if runner exists
    const { data: existingRunner, error: fetchError } = await supabase
        .from('scraper_runners')
        .select('name, status')
        .eq('name', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Check if already paused
    if (existingRunner.status === 'paused') {
        return { success: false, error: 'Runner is already paused' };
    }

    // Update runner status to paused (scraper_runners has no updated_at column)
    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ status: 'paused' })
        .eq('name', id);

    if (updateError) {
        console.error(`Error pausing runner ${id}:`, updateError);
        return { success: false, error: 'Failed to pause runner' };
    }

    revalidatePath('/admin/scrapers/network');
    return { success: true };
}

/**
 * Resume a runner from paused state
 */
export async function resumeRunner(id: string): Promise<{ success: boolean; error?: string }> {
    const { error: adminError } = await verifyAdminAccess();
    if (adminError) {
        return { success: false, error: adminError };
    }

    const supabase = getServiceRoleClient();

    // Check if runner exists
    const { data: existingRunner, error: fetchError } = await supabase
        .from('scraper_runners')
        .select('name, status')
        .eq('name', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Check if runner is not paused
    if (existingRunner.status !== 'paused') {
        return { success: false, error: 'Runner is not paused' };
    }

    // Determine the appropriate status to resume to
    // Typically resumes to 'idle' as it has no active job
    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ status: 'idle' })
        .eq('name', id);

    if (updateError) {
        console.error(`Error resuming runner ${id}:`, updateError);
        return { success: false, error: 'Failed to resume runner' };
    }

    revalidatePath('/admin/scrapers/network');
    return { success: true };
}

/**
 * Delete a runner and its associated API keys
 */
export async function deleteRunner(id: string): Promise<{ success: boolean; error?: string }> {
    const { error: adminError } = await verifyAdminAccess();
    if (adminError) {
        return { success: false, error: adminError };
    }

    const supabase = getServiceRoleClient();

    // Check if runner exists
    const { data: existingRunner, error: fetchError } = await supabase
        .from('scraper_runners')
        .select('name')
        .eq('name', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Use a transaction to delete runner and associated API keys
    // First delete API keys, then delete the runner
    const { error: keysDeleteError } = await supabase
        .from('runner_api_keys')
        .delete()
        .eq('runner_name', id);

    if (keysDeleteError) {
        console.error(`Error deleting API keys for runner ${id}:`, keysDeleteError);
        return { success: false, error: 'Failed to delete runner API keys' };
    }

    // Delete the runner
    const { error: runnerDeleteError } = await supabase
        .from('scraper_runners')
        .delete()
        .eq('name', id);

    if (runnerDeleteError) {
        console.error(`Error deleting runner ${id}:`, runnerDeleteError);
        return { success: false, error: 'Failed to delete runner' };
    }

    revalidatePath('/admin/scrapers/network');
    return { success: true };
}

/**
 * Update runner metadata
 */
export async function updateRunnerMetadata(
    id: string,
    metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
    const { error: adminError } = await verifyAdminAccess();
    if (adminError) {
        return { success: false, error: adminError };
    }

    // Validate metadata
    if (!metadata || typeof metadata !== 'object') {
        return { success: false, error: 'Metadata must be a valid object' };
    }

    const supabase = getServiceRoleClient();

    // Check if runner exists
    const { data: existingRunner, error: fetchError } = await supabase
        .from('scraper_runners')
        .select('name')
        .eq('name', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Update runner metadata (scraper_runners has no updated_at column)
    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ metadata: metadata as Record<string, unknown> })
        .eq('name', id);

    if (updateError) {
        console.error(`Error updating metadata for runner ${id}:`, updateError);
        return { success: false, error: 'Failed to update runner metadata' };
    }

    revalidatePath('/admin/scrapers/network');
    return { success: true };
}

/**
 * Rotate the API key for a runner
 * Revokes all existing keys and creates a new one, preserving settings
 */
export async function rotateRunnerKey(id: string): Promise<{ success: boolean; key?: string; error?: string }> {
    const { error: adminError } = await verifyAdminAccess();
    if (adminError) {
        return { success: false, error: adminError };
    }

    const supabase = getServiceRoleClient();

    // Check if runner exists
    const { data: existingRunner, error: fetchError } = await supabase
        .from('scraper_runners')
        .select('name')
        .eq('name', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Get the most recent active key to copy its settings
    const { data: latestKeys } = await supabase
        .from('runner_api_keys')
        .select('allowed_scrapers, expires_at')
        .eq('runner_name', id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

    const settings = latestKeys?.[0] || { allowed_scrapers: null, expires_at: null };

    // 1. Revoke all existing keys for this runner
    const { error: revokeError } = await supabase
        .from('runner_api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('runner_name', id)
        .is('revoked_at', null);

    if (revokeError) {
        console.error(`Error revoking keys for runner ${id}:`, revokeError);
        return { success: false, error: 'Failed to revoke old API keys' };
    }

    // 2. Generate new API key
    // We use crypto module directly since this is a server action
    const crypto = await import('crypto');
    const randomBytes = crypto.randomBytes(32);
    const keyBody = randomBytes.toString('base64url');
    const key = `bsr_${keyBody}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const prefix = key.substring(0, 12);

    // 3. Insert the new key
    const authSupabase = await createClient();
    const { data: userData } = await authSupabase.auth.getUser();
    
    const { error: insertError } = await supabase
        .from('runner_api_keys')
        .insert({
            runner_name: id,
            key_hash: hash,
            key_prefix: prefix,
            description: 'Rotated API key',
            created_by: userData.user?.id,
            allowed_scrapers: settings.allowed_scrapers,
            expires_at: settings.expires_at,
        });

    if (insertError) {
        console.error(`Error inserting new key for runner ${id}:`, insertError);
        return { success: false, error: 'Failed to create new API key' };
    }

    revalidatePath('/admin/scrapers/network');
    
    return { 
        success: true, 
        key // Return the plain text key so it can be shown once
    };
}
