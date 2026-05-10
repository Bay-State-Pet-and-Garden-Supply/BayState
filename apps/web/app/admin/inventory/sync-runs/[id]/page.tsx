import { notFound } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getInventorySyncRunDetail, getInventoryReconciliationItems } from '@/lib/admin/inventory/queries';
import type { InventoryIssueFilters } from '@/lib/admin/inventory/types';
import { SyncRunDetail } from '@/components/admin/inventory/sync-run-detail';

export default async function SyncRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ issue_type?: string; status?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const detail = await getInventorySyncRunDetail(id);
  if (!detail) notFound();

  const { items } = await getInventoryReconciliationItems({
    syncRunId: id,
    issueType: sp.issue_type as InventoryIssueFilters['issueType'],
    status: sp.status as InventoryIssueFilters['status'],
    page: Number(sp.page ?? 1),
    pageSize: 50,
  });

  return (
    <AdminPageShell title={`Sync Run ${detail.run.file_name || id.slice(0, 8)}`}>
      <SyncRunDetail
        run={detail.run}
        summary={detail.summary}
        items={items}
      />
    </AdminPageShell>
  );
}
