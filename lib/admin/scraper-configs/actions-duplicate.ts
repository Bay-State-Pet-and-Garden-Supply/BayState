import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { scraperConfigSchema } from '../scrapers/schema';

export type ActionState = {
  success: boolean;
  error?: string;
  details?: unknown;
  data?: unknown;
};

export async function duplicateConfig(
  formData: FormData
): Promise<ActionState> {
  try {
    const rawData = {
      sourceConfigId: formData.get('sourceConfigId'),
      newSlug: formData.get('newSlug'),
      newDisplayName: formData.get('newDisplayName'),
    };

    const schema = z.object({
      sourceConfigId: z.string().uuid('Invalid source config ID'),
      newSlug: z.string().min(1, 'New slug is required').max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
      newDisplayName: z.string().max(255).optional(),
    });

    const { sourceConfigId, newSlug, newDisplayName } = schema.parse(rawData);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Fetch source config with current version
    const { data: sourceConfig, error: fetchError } = await supabase
      .from('scraper_configs')
      .select('*')
      .eq('id', sourceConfigId)
      .single();

    if (fetchError || !sourceConfig) {
      return { success: false, error: 'Source config not found' };
    }

    if (!sourceConfig.current_version_id) {
      return { success: false, error: 'Source config has no versions' };
    }

    const { data: sourceVersion, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', sourceConfig.current_version_id)
      .single();

    if (versionError || !sourceVersion) {
      return { success: false, error: 'Source version not found' };
    }

    // Check if new slug already exists
    const { data: existingSlug } = await supabase
      .from('scraper_configs')
      .select('id')
      .eq('slug', newSlug)
      .single();

    if (existingSlug) {
      return { success: false, error: 'A config with this slug already exists' };
    }

    // Create new config
    const { data: newConfig, error: createError } = await supabase
      .from('scraper_configs')
      .insert({
        slug: newSlug,
        display_name: newDisplayName || `${sourceConfig.display_name || sourceConfig.name} (Copy)`,
        domain: sourceConfig.domain,
        schema_version: sourceVersion.schema_version,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error:', createError);
      return { success: false, error: 'Failed to create duplicated config' };
    }

    // Create new draft version
    const { data: newVersion, error: versionCreateError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: newConfig.id,
        schema_version: sourceVersion.schema_version,
        config: sourceVersion.config,
        status: 'draft',
        version_number: 1,
        change_summary: `Duplicated from ${sourceConfig.slug}`,
        created_by: user.id,
      })
      .select()
      .single();

    if (versionCreateError) {
      console.error('Database error:', versionCreateError);
      await supabase.from('scraper_configs').delete().eq('id', newConfig.id);
      return { success: false, error: 'Failed to create duplicated version' };
    }

    // Update current version reference
    await supabase
      .from('scraper_configs')
      .update({ current_version_id: newVersion.id })
      .eq('id', newConfig.id);

    revalidatePath('/admin/scraper-configs');

    return { success: true, data: newConfig };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

export async function rollbackToVersion(
  configId: string,
  targetVersionId: string,
  reason: string
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isStaff = profile?.role === 'admin' || profile?.role === 'staff';
    if (!isStaff) {
      return { success: false, error: 'Forbidden: staff role required' };
    }

    // Fetch the target version
    const { data: targetVersion, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', targetVersionId)
      .eq('config_id', configId)
      .single();

    if (versionError || !targetVersion) {
      return { success: false, error: 'Target version not found' };
    }

    if (targetVersion.status === 'published') {
      return { success: false, error: 'Cannot rollback to a version that is already published' };
    }

    // Find the current published version
    const { data: latestPublished } = await supabase
      .from('scraper_config_versions')
      .select('id, version_number')
      .eq('config_id', configId)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = latestPublished
      ? (latestPublished.version_number || 1) + 1
      : 1;

    // Create a new published version with the target version's config
    const { data: newVersion, error: createError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: configId,
        schema_version: targetVersion.schema_version,
        config: targetVersion.config,
        status: 'published',
        version_number: newVersionNumber,
        published_at: new Date().toISOString(),
        published_by: user.id,
        change_summary: `Rollback to v${targetVersion.version_number}: ${reason}`,
        validation_result: targetVersion.validation_result,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error creating rollback version:', createError);
      return { success: false, error: 'Failed to rollback config' };
    }

    // Update the config's current version
    await supabase
      .from('scraper_configs')
      .update({
        current_version_id: newVersion.id,
        schema_version: targetVersion.schema_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId);

    // Archive the previously published version
    if (latestPublished) {
      await supabase
        .from('scraper_config_versions')
        .update({ status: 'archived' })
        .eq('id', latestPublished.id);
    }

    revalidatePath('/admin/scraper-configs');
    revalidatePath(`/admin/scraper-configs/${configId}/history`);

    return {
      success: true,
      data: {
        ...newVersion,
        rollback_from_version: targetVersion.version_number,
        reason,
      },
    };
  } catch (error) {
    console.error('Action error:', error);
    return { success: false, error: 'Internal server error' };
  }
}
