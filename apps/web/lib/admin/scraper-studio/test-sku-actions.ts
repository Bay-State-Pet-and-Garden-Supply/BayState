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

// Test SKU types
export type TestSkuType = 'test' | 'fake' | 'edge_case';

export interface TestSku {
  id: string;
  config_id: string;
  sku: string;
  sku_type: TestSkuType;
  added_by: string | null;
  created_at: string;
}

// Validation schema for test SKU
const testSkuSchema = z.object({
  configId: z.string().uuid(),
  sku: z.string().min(1, 'SKU is required').max(255),
  skuType: z.enum(['test', 'fake', 'edge_case']),
});

// Validation schema for bulk operations
const bulkTestSkuSchema = z.object({
  configId: z.string().uuid(),
  skus: z.array(z.string().min(1).max(255)).min(1, 'At least one SKU is required'),
  skuType: z.enum(['test', 'fake', 'edge_case']),
});

/**
 * Validate SKU format
 * Returns validation result with error message if invalid
 */
function validateSkuFormat(sku: string): { valid: boolean; error?: string } {
  // Remove whitespace
  const trimmed = sku.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'SKU cannot be empty' };
  }
  
  if (trimmed.length > 255) {
    return { valid: false, error: 'SKU cannot exceed 255 characters' };
  }
  
  // Check for invalid characters (allow alphanumeric, hyphens, underscores, dots, slashes)
  const validPattern = /^[a-zA-Z0-9\-_./\s#@$%&*()]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: 'SKU contains invalid characters' };
  }
  
  return { valid: true };
}

/**
 * Fetch test SKUs for a config
 */
export async function fetchTestSkus(configId: string): Promise<ActionState & { skus?: TestSku[] }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: skus, error } = await supabase
      .from('scraper_config_test_skus')
      .select('*')
      .eq('config_id', configId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return { success: false, error: 'Failed to fetch test SKUs' };
    }

    return { success: true, skus: skus as TestSku[] };
  } catch (error) {
    console.error('Action error:', error);
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Add a single test SKU
 */
export async function addTestSku(formData: FormData): Promise<ActionState> {
  try {
    const rawData = {
      configId: formData.get('configId'),
      sku: formData.get('sku'),
      skuType: formData.get('skuType'),
    };

    const validatedData = testSkuSchema.parse(rawData);

    // Validate SKU format
    const formatValidation = validateSkuFormat(validatedData.sku);
    if (!formatValidation.valid) {
      return { success: false, error: formatValidation.error };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await supabase
      .from('scraper_config_test_skus')
      .insert({
        config_id: validatedData.configId,
        sku: validatedData.sku.trim(),
        sku_type: validatedData.skuType,
        added_by: user.id,
      });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'This SKU already exists for this config' };
      }
      console.error('Database error:', error);
      return { success: false, error: 'Failed to add test SKU' };
    }

    revalidatePath('/admin/scrapers/studio');
    return { success: true };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Bulk add test SKUs
 */
export async function bulkAddTestSkus(formData: FormData): Promise<ActionState> {
  try {
    const rawData = {
      configId: formData.get('configId'),
      skus: JSON.parse(formData.get('skus') as string || '[]'),
      skuType: formData.get('skuType'),
    };

    const validatedData = bulkTestSkuSchema.parse(rawData);

    // Validate all SKUs
    const validationErrors: string[] = [];
    const validSkus: string[] = [];

    for (const sku of validatedData.skus) {
      const formatValidation = validateSkuFormat(sku);
      if (formatValidation.valid) {
        validSkus.push(sku.trim());
      } else {
        validationErrors.push(`${sku}: ${formatValidation.error}`);
      }
    }

    if (validSkus.length === 0) {
      return { 
        success: false, 
        error: 'No valid SKUs to add',
        details: validationErrors 
      };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Insert all valid SKUs
    const inserts = validSkus.map(sku => ({
      config_id: validatedData.configId,
      sku: sku,
      sku_type: validatedData.skuType,
      added_by: user.id,
    }));

    const { error } = await supabase
      .from('scraper_config_test_skus')
      .insert(inserts);

    if (error) {
      if (error.code === '23505') {
        return { 
          success: false, 
          error: 'Some SKUs already exist for this config',
          details: { duplicateSkus: true }
        };
      }
      console.error('Database error:', error);
      return { success: false, error: 'Failed to add test SKUs' };
    }

    revalidatePath('/admin/scrapers/studio');
    return { 
      success: true, 
      data: { 
        added: validSkus.length,
        errors: validationErrors.length > 0 ? validationErrors : undefined 
      } 
    };
  } catch (error) {
    console.error('Action error:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation failed', details: error.issues };
    }
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Delete a test SKU
 */
export async function deleteTestSku(formData: FormData): Promise<ActionState> {
  try {
    const skuId = formData.get('skuId') as string;

    if (!skuId) {
      return { success: false, error: 'SKU ID is required' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await supabase
      .from('scraper_config_test_skus')
      .delete()
      .eq('id', skuId);

    if (error) {
      console.error('Database error:', error);
      return { success: false, error: 'Failed to delete test SKU' };
    }

    revalidatePath('/admin/scrapers/studio');
    return { success: true };
  } catch (error) {
    console.error('Action error:', error);
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Bulk delete test SKUs by IDs
 */
export async function bulkDeleteTestSkus(formData: FormData): Promise<ActionState> {
  try {
    const skuIds = JSON.parse(formData.get('skuIds') as string || '[]') as string[];

    if (!Array.isArray(skuIds) || skuIds.length === 0) {
      return { success: false, error: 'At least one SKU ID is required' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await supabase
      .from('scraper_config_test_skus')
      .delete()
      .in('id', skuIds);

    if (error) {
      console.error('Database error:', error);
      return { success: false, error: 'Failed to delete test SKUs' };
    }

    revalidatePath('/admin/scrapers/studio');
    return { success: true, data: { deleted: skuIds.length } };
  } catch (error) {
    console.error('Action error:', error);
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Import test SKUs from config YAML
 * Parses test_skus, fake_skus, and edge_case_skus arrays
 */
export async function importTestSkusFromConfig(
  formData: FormData
): Promise<ActionState> {
  try {
    const configId = formData.get('configId') as string;
    const configYaml = formData.get('configYaml') as string;

    if (!configId || !configYaml) {
      return { success: false, error: 'Config ID and YAML are required' };
    }

    // Parse YAML to extract SKU arrays
    let config: Record<string, unknown>;
    try {
      // Use dynamic import to avoid SSR issues with yaml package
      const { parse } = await import('yaml');
      config = parse(configYaml) as Record<string, unknown>;
    } catch (parseError) {
      return { success: false, error: 'Failed to parse YAML config' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Collect SKUs by type
    const skuInserts: Array<{
      config_id: string;
      sku: string;
      sku_type: TestSkuType;
      added_by: string;
    }> = [];

    // Extract test_skus (golden/known good)
    if (Array.isArray(config.test_skus)) {
      for (const sku of config.test_skus) {
        if (typeof sku === 'string' && sku.trim()) {
          skuInserts.push({
            config_id: configId,
            sku: sku.trim(),
            sku_type: 'test',
            added_by: user.id,
          });
        }
      }
    }

    // Extract fake_skus (expect 404)
    if (Array.isArray(config.fake_skus)) {
      for (const sku of config.fake_skus) {
        if (typeof sku === 'string' && sku.trim()) {
          skuInserts.push({
            config_id: configId,
            sku: sku.trim(),
            sku_type: 'fake',
            added_by: user.id,
          });
        }
      }
    }

    // Extract edge_case_skus
    if (Array.isArray(config.edge_case_skus)) {
      for (const sku of config.edge_case_skus) {
        if (typeof sku === 'string' && sku.trim()) {
          skuInserts.push({
            config_id: configId,
            sku: sku.trim(),
            sku_type: 'edge_case',
            added_by: user.id,
          });
        }
      }
    }

    if (skuInserts.length === 0) {
      return { success: false, error: 'No SKUs found in config YAML' };
    }

    // Insert SKUs (handle duplicates gracefully)
    const { data: inserted, error } = await supabase
      .from('scraper_config_test_skus')
      .insert(skuInserts)
      .select();

    if (error) {
      if (error.code === '23505') {
        // Some SKUs already exist - this is OK, we'll report partial success
        return { 
          success: true, 
          data: { 
            attempted: skuInserts.length,
            message: 'Some SKUs already existed and were skipped'
          } 
        };
      }
      console.error('Database error:', error);
      return { success: false, error: 'Failed to import test SKUs' };
    }

    revalidatePath('/admin/scrapers/studio');
    return { 
      success: true, 
      data: { 
        imported: inserted?.length || 0,
        types: {
          test: skuInserts.filter(s => s.sku_type === 'test').length,
          fake: skuInserts.filter(s => s.sku_type === 'fake').length,
          edge_case: skuInserts.filter(s => s.sku_type === 'edge_case').length,
        }
      } 
    };
  } catch (error) {
    console.error('Action error:', error);
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Clear all test SKUs for a config (by type or all)
 */
export async function clearTestSkus(formData: FormData): Promise<ActionState> {
  try {
    const configId = formData.get('configId') as string;
    const skuType = formData.get('skuType') as string | null;

    if (!configId) {
      return { success: false, error: 'Config ID is required' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    let query = supabase
      .from('scraper_config_test_skus')
      .delete()
      .eq('config_id', configId);

    if (skuType && ['test', 'fake', 'edge_case'].includes(skuType)) {
      query = query.eq('sku_type', skuType);
    }

    const { error } = await query;

    if (error) {
      console.error('Database error:', error);
      return { success: false, error: 'Failed to clear test SKUs' };
    }

    revalidatePath('/admin/scrapers/studio');
    return { success: true };
  } catch (error) {
    console.error('Action error:', error);
    return { success: false, error: 'Internal server error' };
  }
}
