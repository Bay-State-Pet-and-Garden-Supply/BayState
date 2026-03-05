import Link from 'next/link';
import { PackagePlus, ChevronRight } from 'lucide-react';

interface PipelineStatusProps {
  counts: {
    staging: number;
    scraped: number;
    consolidated: number;
    approved: number;
    published: number;
  };
}

const statusLabels = {
  staging: 'Imported',
  scraped: 'Enhanced',
  consolidated: 'Ready for Review',
  approved: 'Verified',
  published: 'Live',
};

const statusColors = {
  staging: 'bg-muted text-foreground',
  scraped: 'bg-blue-100 text-blue-700',
  consolidated: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  published: 'bg-purple-100 text-purple-700',
};

export function PipelineStatus({ counts }: PipelineStatusProps) {
  const needsAttention = counts.staging + counts.scraped + counts.consolidated;
  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">New Product Intake</h2>
        </div>
        <Link
          href="/admin/pipeline"
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          View All <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {needsAttention > 0 && (
        <div className="mb-4 rounded-lg bg-orange-50 border border-orange-200 p-3">
          <p className="text-sm font-medium text-orange-800">
            {needsAttention} products need attention
          </p>
          <p className="text-xs text-orange-600">
            Review and approve products to publish them to the store
          </p>
        </div>
      )}

      <div className="space-y-2">
        {(Object.keys(statusLabels) as Array<keyof typeof statusLabels>).map(
          (status) => {
            const count = counts[status];
            const percentage = total > 0 ? (count / total) * 100 : 0;

            return (
              <div key={status} className="flex items-center gap-3">
                <div className="w-24 flex-shrink-0">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusColors[status]}`}
                  >
                    {statusLabels[status]}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${status === 'published'
                        ? 'bg-purple-500'
                        : status === 'approved'
                          ? 'bg-green-500'
                          : status === 'consolidated'
                            ? 'bg-orange-500'
                            : status === 'scraped'
                              ? 'bg-blue-500'
                              : 'bg-muted-foreground'
                        }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
                <div className="w-12 text-right text-sm font-medium text-muted-foreground">
                  {count}
                </div>
              </div>
            );
          }
        )}
      </div>

      <div className="mt-4 pt-4 border-t text-center">
        <div className="text-sm text-muted-foreground">
          Total: <span className="font-semibold text-foreground">{total}</span> items in intake
        </div>
      </div>
    </div>
  );
}
