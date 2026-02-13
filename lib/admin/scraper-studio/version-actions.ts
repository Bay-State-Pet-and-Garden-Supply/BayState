'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export type ActionState = {
  success: boolean;
  error?: string;
  details?: unknown;
  data?: unknown;
};

const createVersionSchema = z.object({
  configId: z.string().uuid(),
  config: z.record(z.string(), z.unknown()),
  change_summary: z.string().optional(),
});

export async function createVersion(
  formData: FormData
): Promise<ActionState> {
  try {
    const rawData = {
      configId: formData.get('configId'),
      config: JSON.parse(formData.get('config') as string || '{}'),
      change_summary: formData.get('change_summary'),
    };

    const validatedData = createVersionSchema.parse(rawData);

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

    const { data: config, error: configError } = await supabase
      .from('scraper_configs')
      .select('*')
      .eq('id', validatedData.configId)
      .single();

    if (configError || !config) {
      return { success: false, error: 'Config not found' };
    }

    const { data: latestVersion } = await supabase
      .from('scraper_config_versions')
      .select('version_number')
      .eq('config_id', validatedData.configId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = (latestVersion?.version_number || 0) + 1;

    const { data: newVersion, error: createError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: validatedData.configId,
        schema_version: validatedData.config.schema_version as string || '1.0',
        config: validatedData.config,
        status: 'draft',
        version_number: newVersionNumber,
        change_summary: validatedData.change_summary || `Version ${newVersionNumber}`,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error:', createError);
      return { success: false, error: 'Failed to create version' };
    }

    await supabase
      .from('scraper_configs')
      .update({
        current_version_id: newVersion.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validatedData.configId);

    revalidatePath('/admin/scrapers/studio');
    revalidatePath(`/admin/scrapers/configs/${validatedData.configId}`);

    return { success: true, data: newVersion };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

const publishVersionSchema = z.object({
  versionId: z.string().uuid(),
});

export async function publishVersion(
  formData: FormData
): Promise<ActionState> {
  try {
    const rawData = {
      versionId: formData.get('versionId'),
    };

    const validatedData = publishVersionSchema.parse(rawData);

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

    const { data: version, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', validatedData.versionId)
      .single();

    if (versionError || !version) {
      return { success: false, error: 'Version not found' };
    }

    if (version.status === 'published') {
      return { success: false, error: 'Version is already published' };
    }

    if (version.status !== 'validated' && version.status !== 'draft') {
      return { success: false, error: 'Only validated or draft versions can be published' };
    }

    const { data: latestPublished } = await supabase
      .from('scraper_config_versions')
      .select('id, version_number')
      .eq('config_id', version.config_id)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = latestPublished
      ? (latestPublished.version_number || 1) + 1
      : 1;

    const { data: newVersion, error: createError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: version.config_id,
        schema_version: version.schema_version,
        config: version.config,
        status: 'published',
        version_number: newVersionNumber,
        published_at: new Date().toISOString(),
        published_by: user.id,
        change_summary: `Published from v${version.version_number}`,
        validation_result: version.validation_result,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error:', createError);
      return { success: false, error: 'Failed to publish version' };
    }

    await supabase
      .from('scraper_configs')
      .update({
        current_version_id: newVersion.id,
        schema_version: version.schema_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', version.config_id);

    if (latestPublished) {
      await supabase
        .from('scraper_config_versions')
        .update({ status: 'archived' })
        .eq('id', latestPublished.id);
    }

    revalidatePath('/admin/scrapers/studio');
    revalidatePath(`/admin/scrapers/configs/${version.config_id}`);

    return { success: true, data: newVersion };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

const rollbackVersionSchema = z.object({
  versionId: z.string().uuid(),
  reason: z.string().min(1, 'Rollback reason is required'),
});

export async function rollbackToVersion(
  formData: FormData
): Promise<ActionState> {
  try {
    const rawData = {
      versionId: formData.get('versionId'),
      reason: formData.get('reason'),
    };

    const validatedData = rollbackVersionSchema.parse(rawData);

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

    const { data: targetVersion, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', validatedData.versionId)
      .single();

    if (versionError || !targetVersion) {
      return { success: false, error: 'Target version not found' };
    }

    const { data: latestPublished } = await supabase
      .from('scraper_config_versions')
      .select('id, version_number')
      .eq('config_id', targetVersion.config_id)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = latestPublished
      ? (latestPublished.version_number || 1) + 1
      : 1;

    const { data: newVersion, error: createError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: targetVersion.config_id,
        schema_version: targetVersion.schema_version,
        config: targetVersion.config,
        status: 'published',
        version_number: newVersionNumber,
        published_at: new Date().toISOString(),
        published_by: user.id,
        change_summary: `Rollback to v${targetVersion.version_number}: ${validatedData.reason}`,
        validation_result: targetVersion.validation_result,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error:', createError);
      return { success: false, error: 'Failed to rollback' };
    }

    await supabase
      .from('scraper_configs')
      .update({
        current_version_id: newVersion.id,
        schema_version: targetVersion.schema_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetVersion.config_id);

    if (latestPublished) {
      await supabase
        .from('scraper_config_versions')
        .update({ status: 'archived' })
        .eq('id', latestPublished.id);
    }

    revalidatePath('/admin/scrapers/studio');
    revalidatePath(`/admin/scrapers/configs/${targetVersion.config_id}`);

    return {
      success: true,
      data: {
        ...newVersion,
        rollback_from_version: targetVersion.version_number,
        reason: validatedData.reason,
      },
    };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

export async function fetchVersions(configId: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: versions, error } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('config_id', configId)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return { success: false, error: 'Failed to fetch versions' };
    }

    return { success: true, data: versions };
  } catch (error) {
    console.error('Action error:', error);
    return { success: false, error: 'Internal server error' };
  }
}
