'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
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
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
        .select('id')
        .eq('id', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Check if name is already taken by another runner
    const { data: duplicateName } = await supabase
        .from('scraper_runners')
        .select('id')
        .eq('name', newName.trim())
        .neq('id', id)
        .single();

    if (duplicateName) {
        return { success: false, error: 'A runner with this name already exists' };
    }

    // Update runner name
    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ name: newName.trim(), updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        console.error(`Error renaming runner ${id}:`, updateError);
        return { success: false, error: 'Failed to rename runner' };
    }

    revalidatePath('/admin/scrapers/network');
    revalidatePath(`/admin/scrapers/network/${id}`);
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
        .select('id, status')
        .eq('id', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Check if already paused
    if (existingRunner.status === 'paused') {
        return { success: false, error: 'Runner is already paused' };
    }

    // Update runner status to paused
    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        console.error(`Error pausing runner ${id}:`, updateError);
        return { success: false, error: 'Failed to pause runner' };
    }

    revalidatePath('/admin/scrapers/network');
    revalidatePath(`/admin/scrapers/network/${id}`);
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
        .select('id, status')
        .eq('id', id)
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
        .update({ status: 'idle', updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        console.error(`Error resuming runner ${id}:`, updateError);
        return { success: false, error: 'Failed to resume runner' };
    }

    revalidatePath('/admin/scrapers/network');
    revalidatePath(`/admin/scrapers/network/${id}`);
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
        .select('id, name')
        .eq('id', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Use a transaction to delete runner and associated API keys
    // First delete API keys, then delete the runner
    const { error: keysDeleteError } = await supabase
        .from('runner_api_keys')
        .delete()
        .eq('runner_id', id);

    if (keysDeleteError) {
        console.error(`Error deleting API keys for runner ${id}:`, keysDeleteError);
        return { success: false, error: 'Failed to delete runner API keys' };
    }

    // Delete the runner
    const { error: runnerDeleteError } = await supabase
        .from('scraper_runners')
        .delete()
        .eq('id', id);

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
        .select('id')
        .eq('id', id)
        .single();

    if (fetchError || !existingRunner) {
        return { success: false, error: 'Runner not found' };
    }

    // Update runner metadata
    const { error: updateError } = await supabase
        .from('scraper_runners')
        .update({ metadata: metadata as Record<string, unknown>, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        console.error(`Error updating metadata for runner ${id}:`, updateError);
        return { success: false, error: 'Failed to update runner metadata' };
    }

    revalidatePath('/admin/scrapers/network');
    revalidatePath(`/admin/scrapers/network/${id}`);
    return { success: true };
}
