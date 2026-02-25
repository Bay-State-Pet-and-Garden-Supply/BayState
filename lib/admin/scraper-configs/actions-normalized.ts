// ============================================================================
// NORMALIZED SCHEMA CRUD OPERATIONS (Task 4.2)
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const selectorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  selector: z.string().min(1, 'Selector is required'),
  attribute: z.string().default('text'),
  multiple: z.boolean().default(false),
  required: z.boolean().default(true),
});

const workflowStepSchema = z.object({
  action: z.string().min(1, 'Action is required'),
  name: z.string().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
});

export type ActionState = {
  success: boolean;
  error?: string;
  details?: unknown;
  data?: unknown;
};

/** Add a selector to a version */
export async function addSelector(
  versionId: string,
  data: z.infer<typeof selectorSchema>
): Promise<ActionState> {
  try {
    const validated = selectorSchema.parse(data);
    const supabase = await createClient();
    
    const { data: existing } = await supabase
      .from('scraper_selectors')
      .select('sort_order')
      .eq('version_id', versionId)
      .order('sort_order', { ascending: false })
      .limit(1);
    
    const maxOrder = existing?.[0]?.sort_order ?? -1;
    
    const { error } = await supabase
      .from('scraper_selectors')
      .insert({
        version_id: versionId,
        name: validated.name,
        selector: validated.selector,
        attribute: validated.attribute,
        multiple: validated.multiple,
        required: validated.required,
        sort_order: maxOrder + 1,
      });

    if (error) throw error;
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Add selector error:', error);
    return { success: false, error: 'Failed to add selector' };
  }
}

/** Update a selector */
export async function updateSelector(
  selectorId: string,
  data: Partial<z.infer<typeof selectorSchema>>
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('scraper_selectors')
      .update(data)
      .eq('id', selectorId);

    if (error) throw error;
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Update selector error:', error);
    return { success: false, error: 'Failed to update selector' };
  }
}

/** Delete a selector */
export async function deleteSelector(selectorId: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('scraper_selectors')
      .delete()
      .eq('id', selectorId);

    if (error) throw error;
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Delete selector error:', error);
    return { success: false, error: 'Failed to delete selector' };
  }
}

/** Reorder selectors for a version */
export async function reorderSelectors(
  versionId: string,
  selectorIds: string[]
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    
    for (let i = 0; i < selectorIds.length; i++) {
      const { error } = await supabase
        .from('scraper_selectors')
        .update({ sort_order: i })
        .eq('id', selectorIds[i])
        .eq('version_id', versionId);
      
      if (error) throw error;
    }
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Reorder selectors error:', error);
    return { success: false, error: 'Failed to reorder selectors' };
  }
}

/** Add a workflow step to a version */
export async function addWorkflowStep(
  versionId: string,
  data: z.infer<typeof workflowStepSchema>
): Promise<ActionState> {
  try {
    const validated = workflowStepSchema.parse(data);
    const supabase = await createClient();
    
    const { data: existing } = await supabase
      .from('scraper_workflow_steps')
      .select('sort_order')
      .eq('version_id', versionId)
      .order('sort_order', { ascending: false })
      .limit(1);
    
    const maxOrder = existing?.[0]?.sort_order ?? -1;
    
    const { error } = await supabase
      .from('scraper_workflow_steps')
      .insert({
        version_id: versionId,
        action: validated.action,
        name: validated.name,
        params: validated.params,
        sort_order: maxOrder + 1,
      });

    if (error) throw error;
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Add workflow step error:', error);
    return { success: false, error: 'Failed to add workflow step' };
  }
}

/** Update a workflow step */
export async function updateWorkflowStep(
  stepId: string,
  data: Partial<z.infer<typeof workflowStepSchema>>
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('scraper_workflow_steps')
      .update(data)
      .eq('id', stepId);

    if (error) throw error;
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Update workflow step error:', error);
    return { success: false, error: 'Failed to update workflow step' };
  }
}

/** Delete a workflow step */
export async function deleteWorkflowStep(stepId: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('scraper_workflow_steps')
      .delete()
      .eq('id', stepId);

    if (error) throw error;
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Delete workflow step error:', error);
    return { success: false, error: 'Failed to delete workflow step' };
  }
}

/** Reorder workflow steps for a version */
export async function reorderWorkflowSteps(
  versionId: string,
  stepIds: string[]
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    
    for (let i = 0; i < stepIds.length; i++) {
      const { error } = await supabase
        .from('scraper_workflow_steps')
        .update({ sort_order: i })
        .eq('id', stepIds[i])
        .eq('version_id', versionId);
      
      if (error) throw error;
    }
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Reorder workflow steps error:', error);
    return { success: false, error: 'Failed to reorder workflow steps' };
  }
}

/** Publish a version */
export async function publishVersion(versionId: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    
    const { data: version, error: fetchError } = await supabase
      .from('scraper_config_versions')
      .select('config_id')
      .eq('id', versionId)
      .single();
    
    if (fetchError || !version) {
      return { success: false, error: 'Version not found' };
    }
    
    const { error: updateError } = await supabase
      .from('scraper_config_versions')
      .update({ 
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', versionId);
    
    if (updateError) throw updateError;
    
    const { error: configError } = await supabase
      .from('scraper_configs')
      .update({ current_version_id: versionId })
      .eq('id', version.config_id);
    
    if (configError) throw configError;
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Publish version error:', error);
    return { success: false, error: 'Failed to publish version' };
  }
}

/** Create a new version by cloning current */
export async function createNewVersion(configId: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    
    const { data: config, error: configError } = await supabase
      .from('scraper_configs')
      .select('current_version_id')
      .eq('id', configId)
      .single();
    
    if (configError || !config?.current_version_id) {
      return { success: false, error: 'Config not found or has no version' };
    }
    
    const { data: currentVersion } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', config.current_version_id)
      .single();
    
    if (!currentVersion) {
      return { success: false, error: 'Current version not found' };
    }
    
    const { data: versions } = await supabase
      .from('scraper_config_versions')
      .select('version_number')
      .eq('config_id', configId)
      .order('version_number', { ascending: false })
      .limit(1);
    
    const nextVersion = (versions?.[0]?.version_number ?? 0) + 1;
    
    const { data: newVersion, error: versionError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: configId,
        version_number: nextVersion,
        status: 'draft',
        change_summary: `Clone of v${currentVersion.version_number}`,
        ai_config: currentVersion.ai_config,
        anti_detection: currentVersion.anti_detection,
        validation_config: currentVersion.validation_config,
        login_config: currentVersion.login_config,
        http_status_config: currentVersion.http_status_config,
        normalization_config: currentVersion.normalization_config,
        timeout: currentVersion.timeout,
        retries: currentVersion.retries,
        image_quality: currentVersion.image_quality,
        config: currentVersion.config,
      })
      .select()
      .single();
    
    if (versionError) throw versionError;
    
    // Clone selectors
    const { data: selectors } = await supabase
      .from('scraper_selectors')
      .select('*')
      .eq('version_id', config.current_version_id);
    
    if (selectors?.length) {
      const newSelectors = selectors.map(s => ({
        version_id: newVersion.id,
        name: s.name,
        selector: s.selector,
        attribute: s.attribute,
        multiple: s.multiple,
        required: s.required,
        sort_order: s.sort_order,
      }));
      await supabase.from('scraper_selectors').insert(newSelectors);
    }
    
    // Clone workflow steps
    const { data: steps } = await supabase
      .from('scraper_workflow_steps')
      .select('*')
      .eq('version_id', config.current_version_id);
    
    if (steps?.length) {
      const newSteps = steps.map(s => ({
        version_id: newVersion.id,
        action: s.action,
        name: s.name,
        params: s.params,
        sort_order: s.sort_order,
      }));
      await supabase.from('scraper_workflow_steps').insert(newSteps);
    }
    
    revalidatePath('/admin/scrapers');
    return { success: true, data: newVersion };
  } catch (error) {
    console.error('Create new version error:', error);
    return { success: false, error: 'Failed to create new version' };
  }
}

/** Add a test SKU */
export async function addTestSku(
  configId: string,
  sku: string,
  skuType: 'test' | 'fake' | 'edge_case'
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('scraper_config_test_skus')
      .insert({
        config_id: configId,
        sku,
        sku_type: skuType,
      });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'SKU already exists' };
      }
      throw error;
    }
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Add test SKU error:', error);
    return { success: false, error: 'Failed to add test SKU' };
  }
}

/** Remove a test SKU */
export async function removeTestSku(skuId: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('scraper_config_test_skus')
      .delete()
      .eq('id', skuId);

    if (error) throw error;
    
    revalidatePath('/admin/scrapers');
    return { success: true };
  } catch (error) {
    console.error('Remove test SKU error:', error);
    return { success: false, error: 'Failed to remove test SKU' };
  }
}
