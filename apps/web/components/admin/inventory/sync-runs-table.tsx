'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { IntegrationSyncRun } from '@/lib/orders';

const statusColor: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  partial: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
};

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

export function SyncRunsTable({
  runs,
  totalCount,
  currentPage,
  totalPages,
}: {
  runs: IntegrationSyncRun[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{totalCount} sync run(s)</p>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">File / ID</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Started</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Completed</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Rows</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Inserted</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No sync runs found
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/inventory/sync-runs/${run.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {run.file_name ?? run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={statusColor[run.status] ?? ''}>
                      {run.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(run.started_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.completed_at ? new Date(run.completed_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">{fmt(run.row_count)}</td>
                  <td className="px-4 py-3 text-right">{fmt(run.inserted_count)}</td>
                  <td className="px-4 py-3 text-right">{fmt(run.error_count)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set('page', String(currentPage - 1));
                router.push(`?${params.toString()}`);
              }}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set('page', String(currentPage + 1));
                router.push(`?${params.toString()}`);
              }}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
