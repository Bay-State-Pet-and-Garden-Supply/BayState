'use client';

import { Package, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import type { StatusCount, PipelineStatus } from '@/lib/pipeline';

interface PipelineStatsProps {
  counts: StatusCount[];
  activeStatus?: PipelineStatus | 'all';
  onStatusChange?: (status: PipelineStatus | 'all') => void;
}

const STATUS_CONFIG: Array<{
  status: PipelineStatus;
  label: string;
  icon: typeof Package;
  variant: 'default' | 'warning' | 'success' | 'info';
}> = [
  { status: 'registered', label: 'Registered', icon: Package, variant: 'warning' },
  { status: 'enriched', label: 'Enriched', icon: Sparkles, variant: 'info' },
  { status: 'finalized', label: 'Finalized', icon: CheckCircle, variant: 'success' },
  { status: 'failed', label: 'Failed', icon: AlertCircle, variant: 'default' },
];

function getCountForStatus(counts: StatusCount[], status: PipelineStatus): number {
  const found = counts.find(c => c.status === status);
  return found?.count ?? 0;
}

export function PipelineStats({ counts, activeStatus = 'all', onStatusChange }: PipelineStatsProps) {
  const handleCardClick = (status: PipelineStatus | 'all') => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATUS_CONFIG.map(({ status, label, icon: Icon, variant }) => {
        const count = getCountForStatus(counts, status);
        const isActive = activeStatus === status;

        return (
          <button
            key={status}
            onClick={() => handleCardClick(status)}
            className="text-left"
          >
            <StatCard
              title={label}
              value={count}
              icon={Icon}
              variant={variant}
              subtitle={isActive ? 'Filtering' : undefined}
            />
          </button>
        );
      })}
    </div>
  );
}
