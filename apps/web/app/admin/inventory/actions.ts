'use server';

import { markInventoryIssueStatusAction as markStatus, pushInventoryIssueToPipelineAction as pushPipeline, linkInventoryIssueProductAction as linkProduct } from '@/lib/admin/inventory/mutations';
import { ActionState } from '@/lib/types';
import type { ReconciliationIssueStatus } from '@/lib/admin/integrations/reconciliation-types';

export async function markInventoryIssueStatusAction(issueId: string, status: ReconciliationIssueStatus): Promise<ActionState> {
  return markStatus(issueId, status);
}

export async function pushInventoryIssueToPipelineAction(issueId: string): Promise<ActionState & { count?: number }> {
  return pushPipeline(issueId);
}

export async function linkInventoryIssueProductAction(issueId: string, productId: string): Promise<ActionState> {
  return linkProduct(issueId, productId);
}
