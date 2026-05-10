import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getInventorySyncRuns } from '@/lib/admin/inventory/queries';
import { SyncRunsTable } from '@/components/admin/inventory/sync-runs-table';

export default async function SyncRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const { runs, count } = await getInventorySyncRuns({ page, pageSize: 20 });
  const totalPages = Math.ceil(count / 20);

  return (
    <AdminPageShell title="Sync Runs">
      <SyncRunsTable runs={runs} totalCount={count} currentPage={page} totalPages={totalPages} />
    </AdminPageShell>
  );
}
