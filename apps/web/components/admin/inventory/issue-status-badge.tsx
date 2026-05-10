'use client';

import { Badge } from '@/components/ui/badge';

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  ignored: { label: 'Ignored', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-800 border-green-200' },
  pushed_to_pipeline: { label: 'In Pipeline', color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

export function IssueStatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { label: status, color: 'bg-gray-100 text-gray-800 border-gray-200' };
  return (
    <Badge variant="outline" className={cfg.color}>
      {cfg.label}
    </Badge>
  );
}
