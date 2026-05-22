'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ActionState } from '@/lib/types';
import * as z from 'zod';

/**
 * Ensures the user has admin or staff privileges.
 */
async function requireAdminOrStaff(): Promise<{ id: string; email?: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;
  if (!role || (role !== 'admin' && role !== 'staff')) {
    return null;
  }

  return { id: user.id, email: user.email };
}

const productBatchUpdateSchema = z.object({
  brand_id: z.string().uuid().nullable().optional(),
  pipeline_status: z.enum(['imported', 'awaiting_brand', 'extracting', 'processed', 'merging', 'reviewing', 'publishing', 'failed']).optional(),
  enrichment_config: z.object({
    enabled_sources: z.array(z.string()).optional(),
    official_domains: z.array(z.string()).optional(),
  }).optional(),
});

export async function updateProductsBatch(
  upcs: string[],
  updates: z.infer<typeof productBatchUpdateSchema>
): Promise<ActionState> {
  const user = await requireAdminOrStaff();
  if (!user) {
    return { success: false, error: 'Forbidden: Admin or staff access required' };
  }

  if (!upcs || upcs.length === 0) {
    return { success: false, error: 'No UPCs provided' };
  }

  try {
    const validatedUpdates = productBatchUpdateSchema.parse(updates);
    const supabase = await createClient();
    
    // We need to merge enrichment_config if it exists, or do a simple update if not.
    // For now, let's assume we can just update it.
    const { error } = await supabase
      .from('products_ingestion')
      .update(validatedUpdates)
      .in('upc', upcs);

    if (error) {
      console.error('Database Error in updateProductsBatch:', error);
      return { success: false, error: 'Failed to update products batch' };
    }

    // If brand_id is being assigned, transition any 'awaiting_brand' products in this batch to 'imported'
    if (validatedUpdates.brand_id) {
      const { error: transitionError } = await supabase
        .from('products_ingestion')
        .update({ pipeline_status: 'imported' })
        .in('upc', upcs)
        .eq('pipeline_status', 'awaiting_brand');

      if (transitionError) {
        console.error('Failed to transition products from awaiting_brand to imported:', transitionError);
      }
    }
    
    revalidatePath('/admin/pipeline');
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: 'Validation failed: ' + err.issues[0].message };
    }
    console.error('Unexpected error in updateProductsBatch:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const cohortBatchUpdateSchema = z.object({
  brand_id: z.string().uuid().nullable().optional(),
  brand_name: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

export async function updateCohortBatch(
  cohortId: string,
  updates: z.infer<typeof cohortBatchUpdateSchema>
): Promise<ActionState> {
  const user = await requireAdminOrStaff();
  if (!user) {
    return { success: false, error: 'Forbidden: Admin or staff access required' };
  }

  if (!cohortId) {
    return { success: false, error: 'Cohort ID is required' };
  }

  try {
    const validatedUpdates = cohortBatchUpdateSchema.parse(updates);
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('cohort_batches')
      .update(validatedUpdates)
      .eq('id', cohortId);

    if (error) {
      console.error('Database Error in updateCohortBatch:', error);
      return { success: false, error: 'Failed to update cohort batch' };
    }
    
    revalidatePath('/admin/pipeline');
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: 'Validation failed: ' + err.issues[0].message };
    }
    console.error('Unexpected error in updateCohortBatch:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
