'use server';

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

const createConfigSchema = z.object({
  slug: z.string().min(1, 'Slug is required').max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  display_name: z.string().min(1).max(255).optional(),
  domain: z.string().max(512).optional(),
  config: scraperConfigSchema,
  change_summary: z.string().optional(),
});

export async function createScraperConfig(
  formData: FormData
): Promise<ActionState> {
  try {
    const rawData = {
      slug: formData.get('slug'),
      display_name: formData.get('display_name'),
      domain: formData.get('domain'),
      config: JSON.parse(formData.get('config') as string || '{}'),
      change_summary: formData.get('change_summary'),
    };

    const validatedData = createConfigSchema.parse(rawData);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: config, error: configError } = await supabase
      .from('scraper_configs')
      .insert({
        slug: validatedData.slug,
        display_name: validatedData.display_name ?? null,
        domain: validatedData.domain ?? null,
        schema_version: validatedData.config.schema_version,
        created_by: user.id,
      })
      .select()
      .single();

    if (configError) {
      if (configError.code === '23505') {
        return { success: false, error: 'A config with this slug already exists' };
      }
      console.error('Database error:', configError);
      return { success: false, error: 'Failed to create config' };
    }

    const { data: version, error: versionError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: config.id,
        schema_version: validatedData.config.schema_version,
        config: validatedData.config,
        status: 'draft',
        version_number: 1,
        change_summary: validatedData.change_summary ?? 'Initial draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (versionError) {
      console.error('Database error:', versionError);
      await supabase.from('scraper_configs').delete().eq('id', config.id);
      return { success: false, error: 'Failed to create initial version' };
    }

    await supabase
      .from('scraper_configs')
      .update({ current_version_id: version.id })
      .eq('id', config.id);

    revalidatePath('/admin/scraper-configs');

    return { success: true, data: config };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

const updateDraftSchema = z.object({
  configId: z.string().uuid(),
  config: scraperConfigSchema.partial().optional(),
  change_summary: z.string().nullable().optional(),
});

export async function updateDraft(
  formData: FormData
): Promise<ActionState> {
  try {
    const rawData = {
      configId: formData.get('configId'),
      config: formData.has('config') ? JSON.parse(formData.get('config') as string) : undefined,
      change_summary: formData.get('change_summary'),
    };

    const validatedData = updateDraftSchema.parse(rawData);

    if (!validatedData.config && !validatedData.change_summary) {
      return { success: false, error: 'No changes provided' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: currentConfig, error: fetchError } = await supabase
      .from('scraper_configs')
      .select('current_version_id')
      .eq('id', validatedData.configId)
      .single();

    if (fetchError || !currentConfig?.current_version_id) {
      return { success: false, error: 'Config or draft not found' };
    }

    const { data: currentVersion, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', currentConfig.current_version_id)
      .single();

    if (versionError || !currentVersion) {
      return { success: false, error: 'Draft version not found' };
    }

    if (currentVersion.status !== 'draft') {
      return { success: false, error: 'Current version is not a draft' };
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (validatedData.config) {
      updates.config = validatedData.config;
      updates.schema_version = validatedData.config.schema_version;
      updates.validation_result = null;
    }

    if (validatedData.change_summary) {
      updates.change_summary = validatedData.change_summary;
    }

    const { error: updateError } = await supabase
      .from('scraper_config_versions')
      .update(updates)
      .eq('id', currentConfig.current_version_id);

    if (updateError) {
      console.error('Database error:', updateError);
      return { success: false, error: 'Failed to update draft' };
    }

    revalidatePath('/admin/scraper-configs');

    return { success: true };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

export async function validateDraft(
  configId: string
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: currentConfig, error: fetchError } = await supabase
      .from('scraper_configs')
      .select('current_version_id')
      .eq('id', configId)
      .single();

    if (fetchError || !currentConfig?.current_version_id) {
      return { success: false, error: 'Config not found' };
    }

    const { data: currentVersion, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', currentConfig.current_version_id)
      .single();

    if (versionError || !currentVersion) {
      return { success: false, error: 'Version not found' };
    }

    if (currentVersion.status === 'published') {
      return { success: false, error: 'Cannot validate a published version' };
    }

    const config = currentVersion.config as Record<string, unknown>;
    const parseResult = scraperConfigSchema.safeParse(config);

    const validationResult = {
      valid: parseResult.success,
      errors: parseResult.success ? [] : parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      validated_at: new Date().toISOString(),
      validated_by: user.id,
    };

    const newStatus = parseResult.success ? 'validated' : 'draft';

    const { error: updateError } = await supabase
      .from('scraper_config_versions')
      .update({
        status: newStatus,
        validation_result: validationResult,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentConfig.current_version_id);

    if (updateError) {
      console.error('Database error:', updateError);
      return { success: false, error: 'Failed to validate draft' };
    }

    revalidatePath('/admin/scraper-configs');

    return { success: true, data: validationResult };
  } catch (error) {
    console.error('Action error:', error);
    return { success: false, error: 'Internal server error' };
  }
}

const publishSchema = z.object({
  configId: z.string().uuid(),
  change_summary: z.string().optional(),
});

export async function publishConfig(
  formData: FormData
): Promise<ActionState> {
  try {
    const rawData = {
      configId: formData.get('configId'),
      change_summary: formData.get('change_summary'),
    };

    const { configId, change_summary } = publishSchema.parse(rawData);

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
      .eq('id', configId)
      .single();

    if (configError || !config) {
      return { success: false, error: 'Config not found' };
    }

    if (!config.current_version_id) {
      return { success: false, error: 'No version found to publish' };
    }

    const { data: currentVersion, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', config.current_version_id)
      .single();

    if (versionError || !currentVersion) {
      return { success: false, error: 'Version not found' };
    }

    if (currentVersion.status !== 'validated') {
      return { success: false, error: 'Version must be validated before publishing' };
    }

    const { data: latestPublished } = await supabase
      .from('scraper_config_versions')
      .select('id')
      .eq('config_id', configId)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = latestPublished
      ? (currentVersion.version_number || 1) + 1
      : 1;

    const { data: newVersion, error: createError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: configId,
        schema_version: currentVersion.schema_version,
        config: currentVersion.config,
        status: 'published',
        version_number: newVersionNumber,
        published_at: new Date().toISOString(),
        published_by: user.id,
        change_summary: change_summary || `Published version ${newVersionNumber}`,
        validation_result: currentVersion.validation_result,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error:', createError);
      return { success: false, error: 'Failed to publish config' };
    }

    await supabase
      .from('scraper_configs')
      .update({
        current_version_id: newVersion.id,
        schema_version: currentVersion.schema_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId);

    if (latestPublished) {
      await supabase
        .from('scraper_config_versions')
        .update({ status: 'archived' })
        .eq('id', latestPublished.id);
    }

    revalidatePath('/admin/scraper-configs');

    return { success: true, data: newVersion };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

const rollbackSchema = z.object({
  configId: z.string().uuid(),
  targetVersionId: z.string().uuid(),
  reason: z.string().min(1, 'Rollback reason is required'),
});

export async function rollbackConfig(
  formData: FormData
): Promise<ActionState> {
  try {
    const rawData = {
      configId: formData.get('configId'),
      targetVersionId: formData.get('targetVersionId'),
      reason: formData.get('reason'),
    };

    const { configId, targetVersionId, reason } = rollbackSchema.parse(rawData);

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
      .eq('id', configId)
      .single();

    if (configError || !config) {
      return { success: false, error: 'Config not found' };
    }

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

    await supabase
      .from('scraper_configs')
      .update({
        current_version_id: newVersion.id,
        schema_version: targetVersion.schema_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId);

    if (latestPublished) {
      await supabase
        .from('scraper_config_versions')
        .update({ status: 'archived' })
        .eq('id', latestPublished.id);
    }

    revalidatePath('/admin/scraper-configs');

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
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

// ============================================================================
// Test Running
// ============================================================================

const testRequestSchema = z.object({
  configId: z.string().uuid(),
  skus: z.array(z.string()).optional(),
  headless: z.boolean().default(true),
});

export type TestResultSku = {
  sku: string;
  sku_type: string;
  status: string;
  is_passing: boolean;
  outcome: string;
  selectors: Record<string, { status: string; value: string | null }>;
  data?: Record<string, string>;
  error?: string;
};

export type TestResultSelector = {
  name: string;
  status: string;
  success_count: number;
  fail_count: number;
  last_value: string | null;
};

export type TestResult = {
  status: string;
  scraper_name: string;
  success: boolean;
  summary: {
    total: number;
    success: number;
    no_results: number;
    failed: number;
  };
  skus: TestResultSku[];
  selectors: Record<string, TestResultSelector>;
  execution_time_seconds: number;
  timestamp: string;
  errors: string[];
};

export async function runTest(
  formData: FormData
): Promise<ActionState & { testResult?: TestResult }> {
  try {
    const rawData = {
      configId: formData.get('configId'),
      skus: formData.get('skus') ? JSON.parse(formData.get('skus') as string) : undefined,
      headless: formData.get('headless') === 'true' || formData.get('headless') === '1',
    };

    const { configId, skus, headless } = testRequestSchema.parse(rawData);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Fetch the scraper config to get the slug
    const { data: config, error: configError } = await supabase
      .from('scraper_configs')
      .select('slug, display_name, current_version_id')
      .eq('id', configId)
      .single();

    if (configError || !config) {
      return { success: false, error: 'Config not found' };
    }

    const scraperName = config.slug;
    if (!scraperName) {
      return { success: false, error: 'Config has no slug' };
    }

    // Get the scraper API URL
    const scraperApiUrl = process.env.SCRAPER_API_URL || 'http://localhost:8000';

    // Call the scraper test API
    let testResult: TestResult;

    try {
      const response = await fetch(`${scraperApiUrl}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config_id: configId,
          scraper_name: scraperName,
          skus: skus,
          headless: headless,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Test API error: ${response.status} - ${errorText}`);
      }

      testResult = await response.json() as TestResult;
    } catch (fetchError) {
      console.error('Failed to call scraper test API:', fetchError);
      throw new Error(
        `Failed to run test: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}. ` +
        'Ensure the scraper API is running at ' + scraperApiUrl
      );
    }

    // Store test result in Supabase for history
    try {
      await supabase.from('scraper_test_runs').insert({
        scraper_id: configId,
        scraper_slug: scraperName,
        status: testResult.success ? 'passed' : 'failed',
        execution_time_seconds: testResult.execution_time_seconds,
        result_data: testResult,
        created_by: user.id,
      });

      // Update health status based on test result
      const newHealthStatus = testResult.success ? 'healthy' : 'broken';
      await supabase.rpc('update_scraper_health_from_test', {
        p_scraper_id: configId,
        p_status: testResult.success ? 'passed' : 'failed',
        p_result_data: testResult,
      });
    } catch (dbError) {
      console.error('Failed to store test result:', dbError);
      // Don't fail the test, just log the error
    }

    revalidatePath('/admin/scraper-configs');

    return { success: true, testResult };
  } catch (error) {
    console.error('Test error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run test',
    };
  }
}

export async function getTestResults(
  configId: string
): Promise<ActionState & { testResult?: TestResult }> {
  try {
    const supabase = await createClient();

    // Get the scraper config to find the slug
    const { data: config, error: configError } = await supabase
      .from('scraper_configs')
      .select('slug, display_name')
      .eq('id', configId)
      .single();

    if (configError || !config) {
      return { success: false, error: 'Config not found' };
    }

    // Get the most recent test result
    const { data: testResult, error: testError } = await supabase
      .from('scraper_test_runs')
      .select('*')
      .eq('scraper_id', configId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (testError || !testResult) {
      return { success: true, testResult: undefined };
    }

    return {
      success: true,
      testResult: testResult.result_data as TestResult,
    };
  } catch (error) {
    console.error('Get test results error:', error);
    return { success: false, error: 'Failed to get test results' };
  }
}
