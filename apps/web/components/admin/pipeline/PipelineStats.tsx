'use client';

import { Package, Search, FileCheck, CheckCircle, Globe } from 'lucide-react';
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
  { status: 'staging', label: 'Imported', icon: Package, variant: 'warning' },
  { status: 'scraped', label: 'Enhanced', icon: Search, variant: 'info' },
  { status: 'consolidated', label: 'Ready for Review', icon: FileCheck, variant: 'default' },
  { status: 'approved', label: 'Verified', icon: CheckCircle, variant: 'success' },
  { status: 'published', label: 'Live', icon: Globe, variant: 'success' },
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
