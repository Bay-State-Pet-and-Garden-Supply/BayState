import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ActionState } from '@/lib/types';
import type { ReconciliationIssueStatus } from '@/lib/admin/integrations/reconciliation-types';
import { pushRegisterOnlyIssuesToPipeline } from '@/lib/admin/integra-sync';

export async function batchMarkIssuesStatusAction(
  issueIds: string[],
  status: ReconciliationIssueStatus
): Promise<ActionState & { count?: number }> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = { status };
  if (status === 'resolved' || status === 'ignored') {
    updateData.resolved_at = new Date().toISOString();
  }

  const { error, count } = await supabase
    .from('inventory_reconciliation_items')
    .update(updateData)
    .in('id', issueIds);

  if (error) {
    console.error('Batch update error:', error);
    return { success: false, error: 'Failed to update issues' };
  }

  revalidatePath('/admin/inventory');
  return { success: true, count: count != null ? count : undefined };
}

export async function markInventoryIssueStatusAction(
  issueId: string,
  status: ReconciliationIssueStatus
): Promise<ActionState> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = { status };
  if (status === 'resolved' || status === 'ignored') {
    updateData.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('inventory_reconciliation_items')
    .update(updateData)
    .eq('id', issueId);

  if (error) {
    console.error('Failed to update issue status:', error);
    return { success: false, error: 'Failed to update issue status' };
  }

  revalidatePath('/admin/inventory');
  return { success: true };
}

export async function pushInventoryIssueToPipelineAction(
  issueId: string
): Promise<ActionState & { count?: number }> {
  const result = await pushRegisterOnlyIssuesToPipeline([issueId]);
  revalidatePath('/admin/inventory');
  return {
    success: result.success,
    count: result.count,
    error: result.errors.length > 0 ? result.errors.join(', ') : undefined,
  };
}

export async function linkInventoryIssueProductAction(
  issueId: string,
  productId: string
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('inventory_reconciliation_items')
    .update({ product_id: productId })
    .eq('id', issueId);

  if (error) {
    console.error('Failed to link product:', error);
    return { success: false, error: 'Failed to link product' };
  }

  revalidatePath('/admin/inventory');
  return { success: true };
}
